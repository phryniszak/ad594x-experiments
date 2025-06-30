#include "impedance.h"
#include "ulog.h"

#define ADC_PP_MAX (809)
#define DFT_LOOP_MAX 10

app_impedance_t app_cfg =
    {
        .SysClkFreq = 16000000.0,
        .AdcClkFreq = 16000000.0,
        .RcalVal = 10000.0,
        .HstiaRtiaSel = HSTIARTIA_5K,
        .CtiaSel = 16,
        .VoutPP = 600,
        .SinFreq = 1000.0,
        .ADCSinc3Osr = ADCSINC3OSR_2,
        .ADCSinc2Osr = ADCSINC2OSR_22,
        .DftNum = DFTNUM_8192,
        .DftSrc = DFTSRC_SINC3,
};

int app_get_cfg(void *pCfg)
{
    if (pCfg)
    {
        *(app_impedance_t **)pCfg = &app_cfg;
        return AD5940ERR_OK;
    }
    return AD5940ERR_PARA;
}

int measureDft(struct ad5940_dev *dev, fImpCar_Type *pDftResult)
{
    int ret = ad5940_AFECtrlS(dev, AFECTRL_WG | AFECTRL_ADCPWR, true);
    ret |= ad5940_WriteReg(dev, REG_AFE_DFTREAL, 0);
    ret |= ad5940_WriteReg(dev, REG_AFE_DFTIMAG, 0);
    ret |= ad5940_AFECtrlS(dev, AFECTRL_ADCCNV | AFECTRL_DFT, true);
    if (ret < 0)
        return ret;
    int loopCnt = 0;
    uint32_t real, image;
    do
    {
        ret |= ad5940_ReadReg(dev, REG_AFE_DFTREAL, &real);
        ret |= ad5940_ReadReg(dev, REG_AFE_DFTIMAG, &image);
        loopCnt++;
    } while ((real == 0 || image == 0) && (ret == 0) && (loopCnt < DFT_LOOP_MAX));
    pDftResult->Real = convertDftToInt(real);
    pDftResult->Image = convertDftToInt(image);
    ret |= ad5940_AFECtrlS(dev,
                           AFECTRL_ADCCNV | AFECTRL_DFT | AFECTRL_WG | AFECTRL_ADCPWR,
                           false);
    if (loopCnt == DFT_LOOP_MAX)
        return AD5940ERR_LOOP_OVER;
    return ret;
}

int measureDftIrq(struct ad5940_dev *dev, fImpCar_Type *pDftResult)
{
    int ret = ad5940_AFECtrlS(dev, AFECTRL_WG | AFECTRL_ADCPWR, true);
    ret |= ad5940_INTCClrFlag(dev, AFEINTSRC_DFTRDY);
    ret |= ad5940_AFECtrlS(dev, AFECTRL_ADCCNV | AFECTRL_DFT, true);
    while (ad5940_INTCTestFlag(dev, AFEINTC_1, AFEINTSRC_DFTRDY) == false)
        ;
    ret |= ad5940_AFECtrlS(dev,
                           AFECTRL_ADCCNV | AFECTRL_DFT | AFECTRL_WG | AFECTRL_ADCPWR,
                           false);
    uint32_t real, image;
    ret |= ad5940_ReadReg(dev, REG_AFE_DFTREAL, &real);
    ret |= ad5940_ReadReg(dev, REG_AFE_DFTIMAG, &image);
    pDftResult->Real = convertDftToInt(real);
    pDftResult->Image = convertDftToInt(image);
    return ret;
}

fImpCar_Type computeImpedance(fImpCar_Type *pDftCurr, fImpCar_Type *pDftVolt)
{
    fImpCar_Type res;
    res = ad5940_ComplexDivFloat(pDftCurr, &app_cfg.RtiaCurrValue);
    res = ad5940_ComplexDivFloat(pDftVolt, &res);
    return res;
}

int app_ad_init(struct ad5940_dev *dev)
{
    AFERefCfg_Type aferef_cfg;
    HSLoopCfg_Type hs_loop;
    DSPCfg_Type dsp_cfg;
    bool bADCClk32MHzMode;
    int ret = 0;
    uint32_t ExcitBuffGain = EXCITBUFGAIN_2;
    uint32_t HsDacGain = HSDACGAIN_1;
    uint32_t WgAmpWord;
    if (app_cfg.AdcClkFreq > (32000000 * 0.8))
        bADCClk32MHzMode = true;
    uint32_t ExcitVoltMax = 1800 * 0.8;
    if (app_cfg.VoutPP > ExcitVoltMax)
    {
        app_cfg.VoutPP = ExcitVoltMax;
    }
    if (app_cfg.VoutPP <= ADC_PP_MAX * 0.05)
    {
        ExcitBuffGain = EXCITBUFGAIN_0P25;
        HsDacGain = HSDACGAIN_0P2;
        WgAmpWord = (uint32_t)((app_cfg.VoutPP * 2047) / (ADC_PP_MAX * 0.05));
    }
    else if (app_cfg.VoutPP <= ADC_PP_MAX * 0.25)
    {
        ExcitBuffGain = EXCITBUFGAIN_0P25;
        HsDacGain = HSDACGAIN_1;
        WgAmpWord = (uint32_t)((app_cfg.VoutPP * 2047) / (ADC_PP_MAX * 0.25));
    }
    else if (app_cfg.VoutPP <= ADC_PP_MAX * 0.4)
    {
        ExcitBuffGain = EXCITBUFGAIN_2;
        HsDacGain = HSDACGAIN_0P2;
        WgAmpWord = (uint32_t)((app_cfg.VoutPP * 2047) / (ADC_PP_MAX * 0.4));
    }
    else
    {
        ExcitBuffGain = EXCITBUFGAIN_2;
        HsDacGain = HSDACGAIN_1;
        WgAmpWord = (uint32_t)((app_cfg.VoutPP * 2047) / (ADC_PP_MAX * 2));
    }
    if (WgAmpWord > 0x7ff)
        WgAmpWord = 0x7ff;
    aferef_cfg.HpBandgapEn = true;
    aferef_cfg.Hp1V1BuffEn = true;
    aferef_cfg.Hp1V8BuffEn = true;
    aferef_cfg.Disc1V1Cap = false;
    aferef_cfg.Disc1V8Cap = false;
    aferef_cfg.Hp1V8ThemBuff = false;
    aferef_cfg.Hp1V8Ilimit = false;
    aferef_cfg.Lp1V1BuffEn = false;
    aferef_cfg.Lp1V8BuffEn = false;
    aferef_cfg.LpBandgapEn = true;
    aferef_cfg.LpRefBufEn = true;
    aferef_cfg.LpRefBoostEn = false;
    ret |= ad5940_REFCfgS(dev, &aferef_cfg);
    hs_loop.HsDacCfg.ExcitBufGain = ExcitBuffGain;
    hs_loop.HsDacCfg.HsDacGain = HsDacGain;
    hs_loop.HsDacCfg.HsDacUpdateRate = 7;
    hs_loop.HsTiaCfg.DiodeClose = false;
    hs_loop.HsTiaCfg.HstiaBias = HSTIABIAS_1P1;
    hs_loop.HsTiaCfg.HstiaCtia = app_cfg.CtiaSel;
    hs_loop.HsTiaCfg.HstiaDeRload = HSTIADERLOAD_OPEN;
    hs_loop.HsTiaCfg.HstiaDeRtia = HSTIADERTIA_OPEN;
    hs_loop.HsTiaCfg.HstiaRtiaSel = app_cfg.HstiaRtiaSel;
    hs_loop.SWMatCfg.Dswitch = SWD_OPEN;
    hs_loop.SWMatCfg.Pswitch = SWP_PL | SWP_PL2;
    hs_loop.SWMatCfg.Nswitch = SWN_NL | SWN_NL2;
    hs_loop.SWMatCfg.Tswitch = SWT_TRTIA;
    hs_loop.WgCfg.WgType = WGTYPE_SIN;
    hs_loop.WgCfg.GainCalEn = false;
    hs_loop.WgCfg.OffsetCalEn = false;
    hs_loop.WgCfg.SinCfg.SinFreqWord = ad5940_WGFreqWordCal(app_cfg.SinFreq, app_cfg.SysClkFreq);
    hs_loop.WgCfg.SinCfg.SinAmplitudeWord = WgAmpWord;
    hs_loop.WgCfg.SinCfg.SinOffsetWord = 0;
    hs_loop.WgCfg.SinCfg.SinPhaseWord = 0;
    ret |= ad5940_HSLoopCfgS(dev, &hs_loop);
    dsp_cfg.ADCBaseCfg.ADCMuxN = ADCMUXN_HSTIA_N;
    dsp_cfg.ADCBaseCfg.ADCMuxP = ADCMUXP_HSTIA_P;
    dsp_cfg.ADCBaseCfg.ADCPga = ADCPGA_1;
    memset(&dsp_cfg.ADCDigCompCfg, 0, sizeof(dsp_cfg.ADCDigCompCfg));
    dsp_cfg.ADCFilterCfg.ADCAvgNum = ADCAVGNUM_16;
    dsp_cfg.ADCFilterCfg.ADCRate = bADCClk32MHzMode ? ADCRATE_1P6MHZ : ADCRATE_800KHZ;
    dsp_cfg.ADCFilterCfg.ADCSinc2Osr = app_cfg.ADCSinc2Osr;
    dsp_cfg.ADCFilterCfg.ADCSinc3Osr = app_cfg.ADCSinc3Osr;
    dsp_cfg.ADCFilterCfg.BpSinc3 = false;
    dsp_cfg.ADCFilterCfg.BpNotch = true;
    dsp_cfg.ADCFilterCfg.Sinc2NotchEnable = true;
    dsp_cfg.DftCfg.DftNum = app_cfg.DftNum;
    dsp_cfg.DftCfg.DftSrc = app_cfg.DftSrc;
    dsp_cfg.DftCfg.HanWinEn = true;
    dsp_cfg.ADCFilterCfg.Sinc2NotchClkEnable = true;
    dsp_cfg.ADCFilterCfg.DFTClkEnable = true;
    dsp_cfg.ADCFilterCfg.WGClkEnable = true;
    memset(&dsp_cfg.StatCfg, 0, sizeof(dsp_cfg.StatCfg));
    ret |= ad5940_DSPCfgS(dev, &dsp_cfg);
    ret |= ad5940_AFECtrlS(dev, AFECTRL_HPREFPWR | AFECTRL_HSTIAPWR | AFECTRL_INAMPPWR | AFECTRL_EXTBUFPWR | AFECTRL_DACREFPWR | AFECTRL_HSDACPWR | AFECTRL_SINC2NOTCH,
                           true);
    return ret;
}

int app_measure(struct ad5940_dev *dev, fImpCar_Type *pImpedance)
{
    int ret = 0;
    SWMatrixCfg_Type sw_cfg;
    fImpCar_Type dftCurr, dftVolt;
    sw_cfg.Dswitch = SWD_CE0;
    sw_cfg.Pswitch = SWP_RE0;
    sw_cfg.Nswitch = SWN_SE0;
    sw_cfg.Tswitch = SWT_SE0LOAD | SWT_TRTIA;
    ret |= ad5940_SWMatrixCfgS(dev, &sw_cfg);
    ret |= ad5940_ADCMuxCfgS(dev, ADCMUXP_HSTIA_P, ADCMUXN_HSTIA_N);
    if (ret < 0)
        return ret;
    ret = measureDft(dev, &dftCurr);
    if (ret < 0)
        return ret;
    ret |= ad5940_ADCMuxCfgS(dev, ADCMUXP_VCE0, ADCMUXN_N_NODE);
    if (ret < 0)
        return ret;
    ret = measureDft(dev, &dftVolt);
    if (ret < 0)
        return ret;
    sw_cfg.Dswitch = SWD_OPEN;
    sw_cfg.Pswitch = SWP_PL | SWP_PL2;
    sw_cfg.Nswitch = SWN_NL | SWN_NL2;
    sw_cfg.Tswitch = SWT_TRTIA;
    ret |= ad5940_SWMatrixCfgS(dev, &sw_cfg);
    dftCurr.Real = -dftCurr.Real;
    dftCurr.Image = -dftCurr.Image;
    dftVolt.Real = dftVolt.Real;
    dftVolt.Image = dftVolt.Image;
    fImpCar_Type impedance = computeImpedance(&dftCurr, &dftVolt);
    float magnitude = ad5940_ComplexMagFloat(&impedance);
    float phase = ad5940_ComplexPhaseFloat(&impedance);
    log_info("impedance magnitude=%.2f phase=%.2f", magnitude, phase);
    if (pImpedance != NULL)
    {
        pImpedance->Image = impedance.Image;
        pImpedance->Real = impedance.Real;
    }
    return ret;
}

int app_RTIA_cal(struct ad5940_dev *dev)
{
    HSRTIACal_Type hsrtia_cal = {0};
    hsrtia_cal.AdcClkFreq = app_cfg.AdcClkFreq;
    hsrtia_cal.ADCSinc2Osr = app_cfg.ADCSinc2Osr;
    hsrtia_cal.ADCSinc3Osr = app_cfg.ADCSinc3Osr;
    hsrtia_cal.bPolarResult = false;
    hsrtia_cal.DftCfg.DftNum = app_cfg.DftNum;
    hsrtia_cal.DftCfg.DftSrc = app_cfg.DftSrc;
    hsrtia_cal.DftCfg.HanWinEn = true;
    hsrtia_cal.fRcal = app_cfg.RcalVal;
    hsrtia_cal.HsTiaCfg.DiodeClose = false;
    hsrtia_cal.HsTiaCfg.HstiaBias = HSTIABIAS_1P1;
    hsrtia_cal.HsTiaCfg.HstiaCtia = app_cfg.CtiaSel;
    hsrtia_cal.HsTiaCfg.HstiaDeRload = HSTIADERLOAD_OPEN;
    hsrtia_cal.HsTiaCfg.HstiaDeRtia = HSTIADERTIA_OPEN;
    hsrtia_cal.HsTiaCfg.HstiaRtiaSel = app_cfg.HstiaRtiaSel;
    hsrtia_cal.SysClkFreq = app_cfg.SysClkFreq;
    hsrtia_cal.fFreq = app_cfg.SinFreq;
    return ad5940_HSRtiaCal(dev, &hsrtia_cal, &app_cfg.RtiaCurrValue);
}
