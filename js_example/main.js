import { AD5940 } from "./ad5940_reg.js";
import {
    ad5940_CLKCfg, ad5940_FIFOCfg, ad5940_INTCCfg, ad5940_INTCClrFlag, ad5940_REFCfgS,
    ad5940_AFECtrlS, ad5940_HSDacCfgS, ad5940_HSTIACfgS, ad5940_SWMatrixCfgS, ad5940_WGCfgS,
    ad5940_WGFreqWordCal, ad5940_ADCBaseCfgS, ad5940_ADCFilterCfgS, ad5940_DFTCfgS, convertDftToInt,
    ad5940_ADCMuxCfgS, ad5940_HSRtiaCal, ad5940_Initialize,
} from "./ad5940.js";
import { test_bit_functions, testWriteReadRandom } from "./test.js";
import { SerialPortManager } from "./SerialPortManager.js";


const serialManager = new SerialPortManager();

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const appCfg = {
    SysClkFreq: 16000000,
    AdcClkFreq: 16000000,
    RcalVal: 10000.0,
    HstiaRtiaSel: AD5940.HSTIARTIA_5K,
    CtiaSel: 16,
    VoutPP: 600,
    SinFreq: 1000,
    ADCSinc3Osr: AD5940.ADCSINC3OSR_2,
    ADCSinc2Osr: AD5940.ADCSINC2OSR_22,
    DftNum: AD5940.DFTNUM_8192,
    DftSrc: AD5940.DFTSRC_SINC3,
    dft_loop_max: 10,
};

document.getElementById("rtia-cal").addEventListener("click", async () => {
    try {
        let open = await serialManager.openPort();
        if (!open) { return; }
        await delay(50);
        await serialManager.readJson();
        await initAD5940(serialManager);
        let rtiaResult = {};
        await app_RTIA_cal(serialManager, rtiaResult);

        serialManager.logToTerminal(`RTIA: ${JSON.stringify(rtiaResult)}`, "success");

    } catch (e) {
        console.error("Error:", e);
        serialManager.logToTerminal("Error: " + e.message, "error");
    }
});

document.getElementById("clear-terminal").addEventListener("click", () => {
    serialManager.clearTerminal();
});

document.getElementById("show-details").addEventListener("change", (event) => {
    if (event.target.checked) {
        console.log("Show details: ON");
    } else {
        console.log("Show details: OFF");
    }
});

document.getElementById("run-test").addEventListener("click", async () => {

    let open = await serialManager.openPort();
    if (!open) { return; };

    await delay(50);

    try {
        await serialManager.readJson();
        await serialManager.exchangeJsonRpc("reset", {});
        await testWriteReadRandom(serialManager, 50);
        serialManager.logToTerminal(" ", "info");
        await test_bit_functions(serialManager);

    } catch (e) {
        console.error("Error:", e);
        serialManager.logToTerminal("Error: " + e.message, "error");
    }

    await serialManager.closePort();
});

async function appReadDft(serialManager) {

    await ad5940_AFECtrlS(serialManager, AD5940.AFECTRL_ADCPWR | AD5940.AFECTRL_WG, true);

    await serialManager.exchangeJsonRpc("wr", { address: AD5940.DFTREAL.address, data: 0 });
    await serialManager.exchangeJsonRpc("wr", { address: AD5940.DFTIMAG.address, data: 0 });

    await ad5940_AFECtrlS(serialManager, AD5940.AFECTRL_ADCCNV | AD5940.AFECTRL_DFT, true);

    let loopCnt = 0;
    let regDataReal = 0, regDataImag = 0;
    do {
        let realResp = await serialManager.exchangeJsonRpc("rd", { address: AD5940.DFTREAL.address });
        let imagResp = await serialManager.exchangeJsonRpc("rd", { address: AD5940.DFTIMAG.address });
        regDataReal = realResp.result;
        regDataImag = imagResp.result;
        loopCnt++;
    } while ((regDataReal === 0 || regDataImag === 0) && loopCnt < appCfg.dft_loop_max);

    await ad5940_AFECtrlS(
        serialManager,
        AD5940.AFECTRL_ADCCNV | AD5940.AFECTRL_DFT | AD5940.AFECTRL_WG | AD5940.AFECTRL_ADCPWR, false);

    if (loopCnt < appCfg.dft_loop_max) {
        const real = convertDftToInt(regDataReal);
        const imag = convertDftToInt(regDataImag);
        serialManager.logToTerminal(`DFT results Real: ${real}, Imag: ${imag}, loop cnt: ${loopCnt}`, "info");
        return { real, imag, loopCnt };
    }

    const real = 0;
    const imag = 0;
    return { real, imag, loopCnt };
}

async function initAD5940(serialManager) {
    await serialManager.readJson();

    await serialManager.exchangeJsonRpc("reset", {});

    let adiid = await serialManager.exchangeJsonRpc("rd", { address: AD5940.ADIID.address });
    let ad_ok = (adiid.result === AD5940.ADIID.reset);

    let chipid = await serialManager.exchangeJsonRpc("rd", { address: AD5940.CHIPID.address });
    let chip_ok = (chipid.result & AD5940.CHIPID.BITM_PARTID) === AD5940.CHIPID.reset;
    let chip_revision = chipid.result & AD5940.CHIPID.BITM_REVISION;

    if (ad_ok && chip_ok) {
        serialManager.logToTerminal("AD5940 chip detected.", "success");
        serialManager.logToTerminal(`Chip Revision: ${chip_revision}`, "info");
    } else {
        serialManager.logToTerminal("AD5940 chip not detected.", "error");
        await serialManager.closePort();
        return;
    }

    await ad5940_Initialize(serialManager);

    const clkCfg = {
        HFXTALEn: false,
        HFOSCEn: true,
        LFOSCEn: true,
        HfOSC32MHzMode: false,
        SysClkSrc: AD5940.ADCCLKSRC_HFOSC,
        SysClkDiv: AD5940.SYSCLKDIV_1,
        ADCCLkSrc: AD5940.ADCCLKSRC_HFOSC,
        ADCClkDiv: AD5940.ADCCLKDIV_1,
    };

    await ad5940_CLKCfg(serialManager, clkCfg);
    serialManager.logToTerminal("Clock configuration successful.", "success");

    let fifo_cfg = {
        FIFOEn: false,
        FIFOMode: AD5940.FIFOMODE_FIFO,
        FIFOSize: AD5940.FIFOSIZE_4KB,
        FIFOSrc: AD5940.FIFOSRC_DFT,
        FIFOThresh: 2,
    };
    await ad5940_FIFOCfg(serialManager, fifo_cfg);

    fifo_cfg.FIFOEn = true;
    await ad5940_FIFOCfg(serialManager, fifo_cfg);
    serialManager.logToTerminal("FIFO configuration successful.", "success");

    await ad5940_INTCCfg(serialManager, AD5940.AFEINTC_1, AD5940.AFEINTSRC_ALLINT, true);
    await ad5940_INTCCfg(serialManager, AD5940.AFEINTC_0, AD5940.AFEINTSRC_DATAFIFOTHRESH, true);

    await ad5940_INTCClrFlag(serialManager, AD5940.AFEINTSRC_ALLINT);
    serialManager.logToTerminal("Interrupt configuration successful.", "success");

    await ad5940_AFECtrlS(serialManager, AD5940.AFECTRL_HPREFPWR | AD5940.AFECTRL_HSTIAPWR |
        AD5940.AFECTRL_INAMPPWR | AD5940.AFECTRL_EXTBUFPWR | AD5940.AFECTRL_DACREFPWR |
        AD5940.AFECTRL_HSDACPWR | AD5940.AFECTRL_SINC2NOTCH, true);
    serialManager.logToTerminal("Analog block power on.", "success");
}

async function app_RTIA_cal(serialManager, rtiaResult) {

    const hsrtia_cal = {
        fFreq: appCfg.SinFreq,
        fRcal: appCfg.RcalVal,
        SysClkFreq: appCfg.SysClkFreq,
        AdcClkFreq: appCfg.AdcClkFreq,
        ADCSinc2Osr: appCfg.ADCSinc2Osr,
        ADCSinc3Osr: appCfg.ADCSinc3Osr,
        bPolarResult: false,

        DftCfg: {
            DftNum: appCfg.DftNum,
            DftSrc: appCfg.DftSrc,
            HanWinEn: true,
        },

        HsTiaCfg: {
            DiodeClose: false,
            HstiaBias: AD5940.HSTIABIAS_1P1,
            HstiaCtia: 16,
            HstiaDeRload: AD5940.HSTIADERLOAD_OPEN,
            HstiaDeRtia: AD5940.HSTIADERTIA_OPEN,
            HstiaRtiaSel: appCfg.HstiaRtiaSel,
        },

    };

    return await ad5940_HSRtiaCal(serialManager, hsrtia_cal, rtiaResult);
}


async function replaySerialLog() {

    await serialManager.exchangeJsonRpc("reset", {});

    let resp = await serialManager.exchangeJsonRpc("rd", {
        address: AD5940.ADIID.address,
    });
    const adiid_val = resp.result;

    {
        await serialManager.exchangeJsonRpc("wr", { address: 0x0908, data: 0x2c9 });
        await serialManager.exchangeJsonRpc("wr", { address: AD5940.REPEATADCCNV.address, data: 0x10 });
        await serialManager.exchangeJsonRpc("wr", { address: AD5940.CLKEN1.address, data: 0x2c9 });
        await serialManager.exchangeJsonRpc("wr", { address: 0x238c, data: 0x104 });
        await serialManager.exchangeJsonRpc("wr", {
            address: AD5940.EI2CON.address,
            data: AD5940.EI2CON.BITM_BUSINTEN | (1 << AD5940.EI2CON.BITP_BUSINTMDE),
        });
        await serialManager.exchangeJsonRpc("wr", { address: 0xa04, data: 0x4859 });
        await serialManager.exchangeJsonRpc("wr", { address: 0xa04, data: 0xF27B });
        await serialManager.exchangeJsonRpc("wr", { address: 0xa00, data: 0x8009 });
        await serialManager.exchangeJsonRpc("wr", { address: AD5940.PMBW.address, data: 0 });
    }

    const clkCfg = {
        HFXTALEn: false,
        HFOSCEn: true,
        LFOSCEn: true,
        HfOSC32MHzMode: false,
        SysClkSrc: AD5940.ADCCLKSRC_HFOSC,
        SysClkDiv: AD5940.SYSCLKDIV_1,
        ADCCLkSrc: AD5940.ADCCLKSRC_HFOSC,
        ADCClkDiv: AD5940.ADCCLKDIV_1,
    };
    await ad5940_CLKCfg(serialManager, clkCfg);

    let fifo_cfg = {
        FIFOEn: false,
        FIFOMode: AD5940.FIFOMODE_FIFO,
        FIFOSize: AD5940.FIFOSIZE_4KB,
        FIFOSrc: AD5940.FIFOSRC_DFT,
        FIFOThresh: 2,
    };
    await ad5940_FIFOCfg(serialManager, fifo_cfg);

    fifo_cfg.FIFOEn = true;
    await ad5940_FIFOCfg(serialManager, fifo_cfg);

    await ad5940_INTCCfg(serialManager, AD5940.AFEINTC_1, AD5940.AFEINTSRC_ALLINT, true);
    await ad5940_INTCCfg(serialManager, AD5940.AFEINTC_0, AD5940.AFEINTSRC_DATAFIFOTHRESH, true);

    await ad5940_INTCClrFlag(serialManager, AD5940.AFEINTSRC_ALLINT);

    await ad5940_AFECtrlS(serialManager, AD5940.AFECTRL_ALL, false);

    const bufCfg = {
        HpBandgapEn: true,
        Hp1V1BuffEn: true,
        Hp1V8BuffEn: true,
        Disc1V1Cap: false,
        Disc1V8Cap: false,
        Hp1V8ThemBuff: false,
        Hp1V8Ilimit: false,
        Lp1V1BuffEn: false,
        Lp1V8BuffEn: false,
        LpBandgapEn: false,
        LpRefBufEn: false,
        LpRefBoostEn: false,
    };

    await ad5940_REFCfgS(serialManager, bufCfg);

    const hsDacCfg = {
        ExcitBufGain: AD5940.EXCITBUFGAIN_2,
        HsDacGain: AD5940.HSDACGAIN_1,
        HsDacUpdateRate: 7,
    };
    await ad5940_HSDacCfgS(serialManager, hsDacCfg);

    const hsTiaCfg = {
        HstiaBias: AD5940.HSTIABIAS_1P1,
        HstiaCtia: appCfg.CtiaSel,
        HstiaRtiaSel: appCfg.HstiaRtiaSel,
        DiodeClose: false,
        HstiaDeRtia: AD5940.HSTIADERTIA_OPEN,
        HstiaDeRload: AD5940.HSTIADERLOAD_OPEN,
    };
    await ad5940_HSTIACfgS(serialManager, hsTiaCfg);

    const swMatrixCfg = {
        Dswitch: AD5940.SWD_RCAL0,
        Pswitch: AD5940.SWP_RCAL0,
        Nswitch: AD5940.SWN_RCAL1,
        Tswitch: (AD5940.SWT_RCAL1 | AD5940.SWT_TRTIA),
    };
    await ad5940_SWMatrixCfgS(serialManager, swMatrixCfg);

    const wgCfg = {
        WgType: AD5940.WGTYPE_SIN,
        SinCfg: {
            SinFreqWord: ad5940_WGFreqWordCal(appCfg.SinFreq, appCfg.SysClkFreq),
            SinAmplitudeWord: (appCfg.VoutPP / (2 * 800) * 2047 + 0.5) >>> 0,
            SinOffsetWord: 0,
            SinPhaseWord: 0,
        },
        GainCalEn: false,
        OffsetCalEn: false,
    };
    await ad5940_WGCfgS(serialManager, wgCfg);

    const adcConfig = {
        ADCMuxN: AD5940.ADCMUXN_N_NODE,
        ADCMuxP: AD5940.ADCMUXP_P_NODE,
        ADCPga: AD5940.ADCPGA_1,
    };

    await ad5940_ADCBaseCfgS(serialManager, adcConfig);

    const filtCfg = {
        ADCSinc3Osr: AD5940.ADCSINC3OSR_2,
        ADCSinc2Osr: AD5940.ADCSINC2OSR_22,
        ADCAvgNum: AD5940.ADCAVGNUM_16,
        ADCRate: AD5940.ADCRATE_800KHZ,
        BpNotch: true,
        BpSinc3: false,
        Sinc2NotchEnable: true,
        DFTClkEnable: true,
        Sinc2NotchClkEnable: true,
        WGClkEnable: true,
    };
    serialManager.logToTerminal("-ad5940_ADCFilterCfgS-", "success");
    await ad5940_ADCFilterCfgS(serialManager, filtCfg);

    const dftCfg = {
        DftNum: appCfg.DftNum,
        DftSrc: appCfg.DftSrc,
        HanWinEn: true,
    };
    serialManager.logToTerminal("-ad5940_DFTCfgS-", "success");
    await ad5940_DFTCfgS(serialManager, dftCfg);

    await ad5940_AFECtrlS(serialManager, AD5940.AFECTRL_HSTIAPWR |
        AD5940.AFECTRL_INAMPPWR | AD5940.AFECTRL_EXTBUFPWR | AD5940.AFECTRL_DACREFPWR |
        AD5940.AFECTRL_HSDACPWR | AD5940.AFECTRL_SINC2NOTCH, true);

    let dftRcal = await appReadDft(serialManager);

    await ad5940_ADCMuxCfgS(serialManager, AD5940.ADCMUXP_HSTIA_P, AD5940.ADCMUXN_HSTIA_N);

    let dftRtia = await appReadDft(serialManager);
}