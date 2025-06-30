import {
    AD5940, isValidADCPGA, isValidADCSINC3OSR, isValidADCSINC2OSR,
    isValidADCAVGNUM, isValidADCRATE,
} from "./ad5940_reg.js";

export async function ad5940_AFEPwrBW(serialManager, powerMode, bandwidth) {
    let tempreg = powerMode;
    tempreg |= bandwidth << AD5940.PMBW.BITP_SYSBW;
    return await serialManager.exchangeJsonRpc("wr", { address: AD5940.PMBW.address, data: tempreg });
}

export async function ad5940_HFOSC32MHzCtrl(serialManager, mode32MHz) {
    let clken1Response = await serialManager.exchangeJsonRpc("rd", { address: AD5940.CLKEN1.address });
    let rdCLKEN1 = clken1Response.result;
    let bit8 = (rdCLKEN1 >> 9) & 0x01;
    let bit9 = (rdCLKEN1 >> 8) & 0x01;
    rdCLKEN1 = (rdCLKEN1 & 0xFF) | (bit8 << 8) | (bit9 << 9);
    await serialManager.exchangeJsonRpc("wr", { address: AD5940.CLKEN1.address, data: rdCLKEN1 | AD5940.CLKEN1.BITM_ACLKDIS });
    let hposcconResponse = await serialManager.exchangeJsonRpc("rd", { address: AD5940.HPOSCCON.address });
    let rdHPOSCCON = hposcconResponse.result;

    if (mode32MHz) {
        rdHPOSCCON &= ~AD5940.HPOSCCON.BITM_CLK32MHZEN;
        await serialManager.exchangeJsonRpc("wr", { address: AD5940.HPOSCCON.address, data: rdHPOSCCON });
    } else {
        rdHPOSCCON |= AD5940.HPOSCCON.BITM_CLK32MHZEN;
        await serialManager.exchangeJsonRpc("wr", { address: AD5940.HPOSCCON.address, data: rdHPOSCCON });
    }

    let tempreg = 0;
    do {
        let osccconResponse = await serialManager.exchangeJsonRpc("rd", { address: AD5940.OSCCON.address });
        tempreg = osccconResponse.result;
    } while (!(tempreg & AD5940.OSCCON.BITM_HFOSCOK));

    await serialManager.exchangeJsonRpc("wr", {
        address: AD5940.CLKEN1.address,
        data: rdCLKEN1 & ~AD5940.CLKEN1.BITM_ACLKDIS,
    });
}

export async function ad5940_CLKCfg(serialManager, clkCfg) {
    let tempreg, reg_osccon;

    const oscconResponse = await serialManager.exchangeJsonRpc("rd", { address: AD5940.OSCCON.address });
    reg_osccon = oscconResponse.result;

    if (clkCfg.HFXTALEn) {
        reg_osccon |= AD5940.OSCCON.BITM_HFXTALEN;
        await serialManager.exchangeJsonRpc("wr", { address: AD5940.OSCKEY.address, data: AD5940.OSCKEY.KEY });
        await serialManager.exchangeJsonRpc("wr", { address: AD5940.OSCCON.address, data: reg_osccon });

        do {
            const tempResponse = await serialManager.exchangeJsonRpc("rd", { address: AD5940.OSCCON.address });
            tempreg = tempResponse.result;
        } while (!(tempreg & AD5940.OSCCON.BITM_HFXTALOK));
    }

    if (clkCfg.HFOSCEn) {
        reg_osccon |= AD5940.OSCCON.BITM_HFOSCEN;
        await serialManager.exchangeJsonRpc("wr", { address: AD5940.OSCKEY.address, data: AD5940.OSCKEY.KEY });
        await serialManager.exchangeJsonRpc("wr", { address: AD5940.OSCCON.address, data: reg_osccon });

        do {
            const tempResponse = await serialManager.exchangeJsonRpc("rd", { address: AD5940.OSCCON.address });
            tempreg = tempResponse.result;
        } while (!(tempreg & AD5940.OSCCON.BITM_HFOSCOK));
    }

    if (clkCfg.LFOSCEn) {
        reg_osccon |= AD5940.OSCCON.BITM_LFOSCEN;
        await serialManager.exchangeJsonRpc("wr", { address: AD5940.OSCKEY.address, data: AD5940.OSCKEY.KEY });
        await serialManager.exchangeJsonRpc("wr", { address: AD5940.OSCCON.address, data: reg_osccon });

        do {
            const tempResponse = await serialManager.exchangeJsonRpc("rd", { address: AD5940.OSCCON.address });
            tempreg = tempResponse.result;
        } while (!(tempreg & AD5940.OSCCON.BITM_LFOSCOK));
    }

    await ad5940_HFOSC32MHzCtrl(serialManager, clkCfg.HfOSC32MHzMode);

    tempreg = clkCfg.SysClkDiv & 0x3f;
    tempreg |= (clkCfg.SysClkDiv & 0x3f) << AD5940.CLKCON0.BITP_SYSCLKDIV;
    tempreg |= (clkCfg.ADCClkDiv & 0xf) << AD5940.CLKCON0.BITP_ADCCLKDIV;
    await serialManager.exchangeJsonRpc("wr", { address: AD5940.CLKCON0.address, data: tempreg });

    tempreg = clkCfg.SysClkSrc;
    tempreg |= clkCfg.ADCCLkSrc << AD5940.CLKSEL.BITP_ADCCLKSEL;
    await serialManager.exchangeJsonRpc("wr", { address: AD5940.CLKSEL.address, data: tempreg });

    if (!clkCfg.HFXTALEn) { reg_osccon &= ~AD5940.OSCCON.BITM_HFXTALEN; }
    if (!clkCfg.HFOSCEn) { reg_osccon &= ~AD5940.OSCCON.BITM_HFOSCEN; }
    if (!clkCfg.LFOSCEn) { reg_osccon &= ~AD5940.OSCCON.BITM_LFOSCEN; }

    await serialManager.exchangeJsonRpc("wr", { address: AD5940.OSCKEY.address, data: AD5940.OSCKEY.KEY });
    await serialManager.exchangeJsonRpc("wr", { address: AD5940.OSCCON.address, data: reg_osccon });
}

export async function ad5940_REFCfgS(serialManager, bufCfg) {
    const afeconResponse = await serialManager.exchangeJsonRpc("rd", { address: AD5940.AFECON.address });
    let tempreg = afeconResponse.result;
    tempreg &= ~AD5940.AFECON.BITM_HPREFDIS;
    if (!bufCfg.HpBandgapEn) {
        tempreg |= AD5940.AFECON.BITM_HPREFDIS;
    }
    await serialManager.exchangeJsonRpc("wr", { address: AD5940.AFECON.address, data: tempreg });

    const bufsenconResponse = await serialManager.exchangeJsonRpc("rd", { address: AD5940.BUFSENCON.address });
    tempreg = bufsenconResponse.result;

    if (bufCfg.Hp1V8BuffEn) { tempreg |= AD5940.BUFSENCON.BITM_V1P8HPADCEN; }
    if (bufCfg.Hp1V1BuffEn) { tempreg |= AD5940.BUFSENCON.BITM_V1P1HPADCEN; }
    if (bufCfg.Lp1V8BuffEn) { tempreg |= AD5940.BUFSENCON.BITM_V1P8LPADCEN; }
    if (bufCfg.Lp1V1BuffEn) { tempreg |= AD5940.BUFSENCON.BITM_V1P1LPADCEN; }
    if (bufCfg.Hp1V8ThemBuff) { tempreg |= AD5940.BUFSENCON.BITM_V1P8THERMSTEN; }
    if (bufCfg.Hp1V8Ilimit) { tempreg |= AD5940.BUFSENCON.BITM_V1P8HPADCILIMITEN; }
    if (bufCfg.Disc1V8Cap) { tempreg |= AD5940.BUFSENCON.BITM_V1P8HPADCCHGDIS; }
    if (bufCfg.Disc1V1Cap) { tempreg |= AD5940.BUFSENCON.BITM_V1P1LPADCCHGDIS; }

    await serialManager.exchangeJsonRpc("wr", { address: AD5940.BUFSENCON.address, data: tempreg });

    tempreg = 0;
    if (!bufCfg.LpRefBufEn) { tempreg |= AD5940.LPREFBUFCON.BITM_LPBUF2P5DIS; }
    if (!bufCfg.LpBandgapEn) { tempreg |= AD5940.LPREFBUFCON.BITM_LPREFDIS; }
    if (bufCfg.LpRefBoostEn) { tempreg |= AD5940.LPREFBUFCON.BITM_BOOSTCURRENT; }

    await serialManager.exchangeJsonRpc("wr", { address: AD5940.LPREFBUFCON.address, data: tempreg });
}

export async function ad5940_HSDacCfgS(serialManager, hsDacCfg) {
    let tempreg = 0;

    if (hsDacCfg.ExcitBufGain === AD5940.EXCITBUFGAIN_0P25) {
        tempreg |= AD5940.HSDACCON.BITM_INAMPGNMDE;
    }

    if (hsDacCfg.HsDacGain === AD5940.HSDACGAIN_0P2) {
        tempreg |= AD5940.HSDACCON.BITM_ATTENEN;
    }

    tempreg |= (hsDacCfg.HsDacUpdateRate & 0xff) << AD5940.HSDACCON.BITP_RATE;

    await serialManager.exchangeJsonRpc("wr", { address: AD5940.HSDACCON.address, data: tempreg });
}

export async function ad5940_HSTIACfgS(serialManager, hsTiaCfg) {

    if (!hsTiaCfg) {
        throw new Error("Invalid configuration: hsTiaCfg is null or undefined.");
    }
    if (hsTiaCfg.HstiaDeRtia < AD5940.HSTIADERTIA_1K || hsTiaCfg.HstiaDeRtia > AD5940.HSTIADERTIA_OPEN) {
        throw new Error("Invalid HstiaDeRtia value.");
    }
    if (hsTiaCfg.HstiaDeRload > AD5940.HSTIADERLOAD_OPEN) {
        throw new Error("Invalid HstiaDeRload value.");
    }

    let tempreg = hsTiaCfg.HstiaBias;
    await serialManager.exchangeJsonRpc("wr", { address: AD5940.HSTIACON.address, data: tempreg });

    tempreg = (hsTiaCfg.HstiaCtia << AD5940.HSRTIACON.BITP_CTIACON);
    tempreg |= hsTiaCfg.HstiaRtiaSel;
    if (hsTiaCfg.DiodeClose) {
        tempreg |= AD5940.HSRTIACON.BITM_TIASW6CON;
    }
    await serialManager.exchangeJsonRpc("wr", { address: AD5940.HSRTIACON.address, data: tempreg });

    tempreg = 0;
    if (hsTiaCfg.HstiaDeRtia >= AD5940.HSTIADERTIA_OPEN) {
        tempreg = 0x1f << 3;
    } else if (hsTiaCfg.HstiaDeRtia >= AD5940.HSTIADERTIA_1K) {
        tempreg = (hsTiaCfg.HstiaDeRtia - 3 + 11) << 3;
    } else {
        const DeRtiaTable = [
            [0x00, 0x01, 0x02, 0x03, 0x06],
            [0x03, 0x04, 0x05, 0x06, 0x07],
            [0x07, 0x07, 0x09, 0x09, 0x0a],
        ];
        if (hsTiaCfg.HstiaDeRload < AD5940.HSTIA.DERLOAD_OPEN) {
            tempreg = DeRtiaTable[hsTiaCfg.HstiaDeRtia][hsTiaCfg.HstiaDeRload] << 3;
        } else {
            tempreg = 0x1f << 3;
        }
    }

    tempreg |= hsTiaCfg.HstiaDeRload;

    await serialManager.exchangeJsonRpc("wr", { address: AD5940.DE0RESCON.address, data: tempreg });
}

export async function ad5940_SWMatrixCfgS(serialManager, swMatrixCfg) {

    await serialManager.exchangeJsonRpc("wr", {
        address: AD5940.DSWFULLCON.address,
        data: swMatrixCfg.Dswitch,
    });

    await serialManager.exchangeJsonRpc("wr", {
        address: AD5940.PSWFULLCON.address,
        data: swMatrixCfg.Pswitch,
    });

    await serialManager.exchangeJsonRpc("wr", {
        address: AD5940.NSWFULLCON.address,
        data: swMatrixCfg.Nswitch,
    });

    await serialManager.exchangeJsonRpc("wr", {
        address: AD5940.TSWFULLCON.address,
        data: swMatrixCfg.Tswitch,
    });

    await serialManager.exchangeJsonRpc("wr", {
        address: AD5940.SWCON.address,
        data: AD5940.SWCON.BITM_SWSOURCESEL,
    });
}

export async function ad5940_WGCfgS(serialManager, wgCfg) {
    if (wgCfg.WgType === AD5940.WGTYPE_SIN) {
        await serialManager.exchangeJsonRpc("wr", {
            address: AD5940.WGFCW.address,
            data: wgCfg.SinCfg.SinFreqWord,
        });
        await serialManager.exchangeJsonRpc("wr", {
            address: AD5940.WGAMPLITUDE.address,
            data: wgCfg.SinCfg.SinAmplitudeWord,
        });
        await serialManager.exchangeJsonRpc("wr", {
            address: AD5940.WGOFFSET.address,
            data: wgCfg.SinCfg.SinOffsetWord,
        });
        await serialManager.exchangeJsonRpc("wr", {
            address: AD5940.WGPHASE.address,
            data: wgCfg.SinCfg.SinPhaseWord,
        });
    } else if (wgCfg.WgType === AD5940.WGTYPE_TRAPZ) {
        await serialManager.exchangeJsonRpc("wr", {
            address: AD5940.WGDCLEVEL1.address,
            data: wgCfg.TrapzCfg.WGTrapzDCLevel1,
        });
        await serialManager.exchangeJsonRpc("wr", {
            address: AD5940.WGDCLEVEL2.address,
            data: wgCfg.TrapzCfg.WGTrapzDCLevel2,
        });
        await serialManager.exchangeJsonRpc("wr", {
            address: AD5940.WGDELAY1.address,
            data: wgCfg.TrapzCfg.WGTrapzDelay1,
        });
        await serialManager.exchangeJsonRpc("wr", {
            address: AD5940.WGDELAY2.address,
            data: wgCfg.TrapzCfg.WGTrapzDelay2,
        });
        await serialManager.exchangeJsonRpc("wr", {
            address: AD5940.WGSLOPE1.address,
            data: wgCfg.TrapzCfg.WGTrapzSlope1,
        });
        await serialManager.exchangeJsonRpc("wr", {
            address: AD5940.WGSLOPE2.address,
            data: wgCfg.TrapzCfg.WGTrapzSlope2,
        });
    } else {
        await serialManager.exchangeJsonRpc("wr", {
            address: AD5940.HSDACDAT.address,
            data: wgCfg.WgCode,
        });
    }

    let tempreg = 0;
    if (wgCfg.GainCalEn) { tempreg |= AD5940.WGCON.BITM_DACGAINCAL; }
    if (wgCfg.OffsetCalEn) { tempreg |= AD5940.WGCON.BITM_DACOFFSETCAL; }
    tempreg |= (wgCfg.WgType << AD5940.WGCON.BITP_TYPESEL);

    await serialManager.exchangeJsonRpc("wr", {
        address: AD5940.WGCON.address,
        data: tempreg,
    });
}

export function ad5940_WGFreqWordCal(SinFreqHz, WGClock) {
    const BITWIDTH_WGFCW = 30;
    if (WGClock === 0) { return 0; }

    let temp = Math.round(SinFreqHz * (1 << BITWIDTH_WGFCW) / WGClock);

    if (temp > AD5940.WGFCW.BITM_SINEFCW) {
        temp = AD5940.WGFCW.BITM_SINEFCW;
    }

    return temp >>> 0;
}

export async function ad5940_ADCBaseCfgS(serialManager, adcInit) {

    if (!isValidADCPGA(adcInit.ADCPga)) {
        throw new Error("Invalid ADCPga value");
    }

    let tempreg = 0;
    tempreg = adcInit.ADCMuxP;
    tempreg |= (adcInit.ADCMuxN << AD5940.ADCCON.BITP_MUXSELN);
    tempreg |= (adcInit.ADCPga << AD5940.ADCCON.BITP_GNPGA);

    await serialManager.exchangeJsonRpc("wr", { address: AD5940.ADCCON.address, data: tempreg });
}

export async function ad5940_ADCFilterCfgS(serialManager, filtCfg) {

    if (!isValidADCSINC3OSR(filtCfg.ADCSinc3Osr)) {
        throw new Error("Invalid ADCSinc3Osr value");
    }
    if (!isValidADCSINC2OSR(filtCfg.ADCSinc2Osr)) {
        throw new Error("Invalid ADCSinc2Osr value");
    }
    if (!isValidADCAVGNUM(filtCfg.ADCAvgNum)) {
        throw new Error("Invalid ADCAvgNum value");
    }
    if (!isValidADCRATE(filtCfg.ADCRate)) {
        throw new Error("Invalid ADCRate value");
    }

    const readResp = await serialManager.exchangeJsonRpc("rd", { address: AD5940.ADCFILTERCON.address });
    let tempreg = readResp.result;

    tempreg &= AD5940.ADCFILTERCON.BITM_AVRGEN;

    tempreg |= filtCfg.ADCRate;

    if (filtCfg.BpNotch) { tempreg |= AD5940.ADCFILTERCON.BITM_LPFBYPEN; }
    if (filtCfg.BpSinc3) { tempreg |= AD5940.ADCFILTERCON.BITM_SINC3BYP; }

    tempreg |= (filtCfg.ADCSinc2Osr << AD5940.ADCFILTERCON.BITP_SINC2OSR);
    tempreg |= (filtCfg.ADCSinc3Osr << AD5940.ADCFILTERCON.BITP_SINC3OSR);
    tempreg |= (filtCfg.ADCAvgNum << AD5940.ADCFILTERCON.BITP_AVRGNUM);

    if (filtCfg.Sinc2NotchClkEnable === false) { tempreg |= AD5940.ADCFILTERCON.BITM_SINC2CLKENB; }
    if (filtCfg.WGClkEnable === false) { tempreg |= AD5940.ADCFILTERCON.BITM_DACWAVECLKENB; }
    if (filtCfg.DFTClkEnable === false) { tempreg |= AD5940.ADCFILTERCON.BITM_DFTCLKENB; }

    await serialManager.exchangeJsonRpc("wr", { address: AD5940.ADCFILTERCON.address, data: tempreg });

    if (filtCfg.Sinc2NotchEnable) {
        await ad5940_AFECtrlS(serialManager, AD5940.AFECTRL_SINC2NOTCH, true);
    }
}

export async function ad5940_ADCDigCompCfgS(serialManager, compCfg) {
    await serialManager.exchangeJsonRpc("wr", {
        address: AD5940.ADCMIN.address,
        data: compCfg.ADCMin,
    });
    await serialManager.exchangeJsonRpc("wr", {
        address: AD5940.ADCMINSM.address,
        data: compCfg.ADCMinHys,
    });
    await serialManager.exchangeJsonRpc("wr", {
        address: AD5940.ADCMAX.address,
        data: compCfg.ADCMax,
    });
    await serialManager.exchangeJsonRpc("wr", {
        address: AD5940.ADCMAXSMEN.address,
        data: compCfg.ADCMaxHys,
    });
}

export async function ad5940_DFTCfgS(serialManager, dftCfg) {
    let reg_dftcon = 0;

    let adcfilterResp = await serialManager.exchangeJsonRpc("rd", { address: AD5940.ADCFILTERCON.address });
    let reg_adcfilter = adcfilterResp.result;

    if (dftCfg.DftSrc === AD5940.DFTSRC_AVG) {
        reg_adcfilter |= AD5940.ADCFILTERCON.BITM_AVRGEN;
        await serialManager.exchangeJsonRpc("wr", { address: AD5940.ADCFILTERCON.address, data: reg_adcfilter });
    } else {
        reg_adcfilter &= ~AD5940.ADCFILTERCON.BITM_AVRGEN;
        await serialManager.exchangeJsonRpc("wr", { address: AD5940.ADCFILTERCON.address, data: reg_adcfilter });

        reg_dftcon |= (dftCfg.DftSrc << AD5940.DFTCON.BITP_DFTINSEL);
    }

    reg_dftcon |= (dftCfg.DftNum << AD5940.DFTCON.BITP_DFTNUM);

    if (dftCfg.HanWinEn) {
        reg_dftcon |= AD5940.DFTCON.BITM_HANNINGEN;
    }

    await serialManager.exchangeJsonRpc("wr", { address: AD5940.DFTCON.address, data: reg_dftcon });
}

export async function ad5940_StatisticCfgS(serialManager, statCfg) {
    let tempreg = 0;
    if (statCfg.StatEnable === true) { tempreg |= AD5940.STATSCON.BITM_STATSEN; }
    tempreg |= (statCfg.StatSample << AD5940.STATSCON.BITP_SAMPLENUM);
    tempreg |= (statCfg.StatDev << AD5940.STATSCON.BITP_STDDEV);
    await serialManager.exchangeJsonRpc("wr", {
        address: AD5940.STATSCON.address,
        data: tempreg,
    });
}

export async function ad5940_AFECtrlS(serialManager, AfeCtrlSet, state) {
    let resp = await serialManager.exchangeJsonRpc("rd", { address: AD5940.AFECON.address });
    let tempreg = resp.result;

    if (state === true) {
        if (AfeCtrlSet & AD5940.AFECTRL_HPREFPWR) {
            tempreg &= ~AD5940.AFECON.BITM_HPREFDIS;
            AfeCtrlSet &= ~AD5940.AFECTRL_HPREFPWR;
        }
        if (AfeCtrlSet & AD5940.AFECTRL_ALDOLIMIT) {
            tempreg &= ~AD5940.AFECON.BITM_ALDOILIMITEN;
            AfeCtrlSet &= ~AD5940.AFECTRL_ALDOLIMIT;
        }
        tempreg |= AfeCtrlSet;
    } else {
        if (AfeCtrlSet & AD5940.AFECTRL_HPREFPWR) {
            tempreg |= AD5940.AFECON.BITM_HPREFDIS;
            AfeCtrlSet &= ~AD5940.AFECTRL_HPREFPWR;
        }
        if (AfeCtrlSet & AD5940.AFECTRL_ALDOLIMIT) {
            tempreg |= AD5940.AFECON.BITM_ALDOILIMITEN;
            AfeCtrlSet &= ~AD5940.AFECTRL_ALDOLIMIT;
        }
        tempreg &= ~AfeCtrlSet;
    }

    await serialManager.exchangeJsonRpc("wr", {
        address: AD5940.AFECON.address,
        data: tempreg,
    });
}

export async function ad5940_Initialize(serialManager) {

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

export async function ad5940_FIFOCfg(serialManager, fifoCfg) {

    await serialManager.exchangeJsonRpc("wr", { address: AD5940.FIFOCON.address, data: 0 });

    let cmdDataConResp = await serialManager.exchangeJsonRpc("rd", { address: AD5940.CMDDATACON.address });
    let tempreg = cmdDataConResp.result;

    tempreg &= AD5940.CMDDATACON.BITM_CMD_MEM_SEL | AD5940.CMDDATACON.BITM_CMDMEMMDE;

    tempreg |= (fifoCfg.FIFOMode << AD5940.CMDDATACON.BITP_DATAMEMMDE);
    tempreg |= (fifoCfg.FIFOSize << AD5940.CMDDATACON.BITP_DATA_MEM_SEL);

    await serialManager.exchangeJsonRpc("wr", { address: AD5940.CMDDATACON.address, data: tempreg });

    await serialManager.exchangeJsonRpc("wr", {
        address: AD5940.DATAFIFOTHRES.address,
        data: fifoCfg.FIFOThresh << AD5940.DATAFIFOTHRES.BITP_HIGHTHRES,
    });

    tempreg = 0;
    if (fifoCfg.FIFOEn === true) {
        tempreg |= AD5940.FIFOCON.BITM_DATAFIFOEN;
    }
    tempreg |= (fifoCfg.FIFOSrc << AD5940.FIFOCON.BITP_DATAFIFOSRCSEL);

    await serialManager.exchangeJsonRpc("wr", { address: AD5940.FIFOCON.address, data: tempreg });
}

export async function ad5940_INTCCfg(serialManager, AfeIntcSel, AFEIntSrc, state) {

    const regaddr = (AfeIntcSel === AD5940.AFEINTC_1) ? AD5940.INTC_INTCSEL1.address : AD5940.INTC_INTCSEL0.address;

    const response = await serialManager.exchangeJsonRpc("rd", { address: regaddr });

    let tempreg = response.result;

    if (state === true) {
        tempreg |= AFEIntSrc;
    } else {
        tempreg &= ~AFEIntSrc;
    }

    await serialManager.exchangeJsonRpc("wr", {
        address: regaddr,
        data: tempreg,
    });
}

export async function ad5940_INTCClrFlag(serialManager, AfeIntSrcSel) {
    await serialManager.exchangeJsonRpc("wr", {
        address: AD5940.INTC_INTCCLR.address,
        data: AfeIntSrcSel,
    });
}

export async function ad5940_ADCMuxCfgS(serialManager, ADCMuxP, ADCMuxN) {

    const resp = await serialManager.exchangeJsonRpc("rd", { address: AD5940.ADCCON.address });
    let tempreg = resp.result;

    tempreg &= ~(AD5940.ADCCON.BITM_MUXSELN | AD5940.ADCCON.BITM_MUXSELP);

    tempreg |= (ADCMuxP << AD5940.ADCCON.BITP_MUXSELP);
    tempreg |= (ADCMuxN << AD5940.ADCCON.BITP_MUXSELN);

    await serialManager.exchangeJsonRpc("wr", { address: AD5940.ADCCON.address, data: tempreg });
}

export async function ad5940_INTCTestFlag(serialManager, AfeIntcSel, AfeIntSrcSel) {
    const regaddr = (AfeIntcSel === AD5940.AFEINTC_0)
        ? AD5940.INTC_INTCFLAG0.address : AD5940.INTC_INTCFLAG1.address;

    const resp = await serialManager.exchangeJsonRpc("rd", { address: regaddr });
    const tempreg = resp.result;

    return (tempreg & AfeIntSrcSel) !== 0;
}

export async function ad5940_HSRtiaCal(serialManager, calCfg, result) {

    let bADCClk32MHzMode = false;
    if (calCfg.AdcClkFreq > (32000000 * 0.8)) { bADCClk32MHzMode = true; }

    const HpRtiaTable = [200, 1000, 5000, 10000, 20000, 40000, 80000, 160000, 0];
    let ExcitBuffGain = AD5940.EXCITBUFGAIN_2;
    let HsDacGain = AD5940.HSDACGAIN_1;
    let RtiaVal = HpRtiaTable[calCfg.HsTiaCfg.HstiaRtiaSel];
    let ExcitVolt = 1800 * 0.8 * calCfg.fRcal / RtiaVal;
    let WgAmpWord;

    if (ExcitVolt <= 800 * 0.05) {
        ExcitBuffGain = AD5940.EXCITBUFGAIN_0P25;
        HsDacGain = AD5940.HSDACGAIN_0P2;
        WgAmpWord = Math.round(ExcitVolt / 40 * 2047);
    } else if (ExcitVolt <= 800 * 0.25) {
        ExcitBuffGain = AD5940.EXCITBUFGAIN_0P25;
        HsDacGain = AD5940.HSDACGAIN_1;
        WgAmpWord = Math.round(ExcitVolt / 200 * 2047);
    } else if (ExcitVolt <= 800 * 0.4) {
        ExcitBuffGain = AD5940.EXCITBUFGAIN_2;
        HsDacGain = AD5940.HSDACGAIN_0P2;
        WgAmpWord = Math.round(ExcitVolt / 320 * 2047);
    } else {
        ExcitBuffGain = AD5940.EXCITBUFGAIN_2;
        HsDacGain = AD5940.HSDACGAIN_1;
        WgAmpWord = Math.round(ExcitVolt / 1600 * 2047);
    }
    if (WgAmpWord > 0x7ff) { WgAmpWord = 0x7ff; }

    await ad5940_AFECtrlS(serialManager, AD5940.AFECTRL_ALL, false);

    const aferef_cfg = {
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
    await ad5940_REFCfgS(serialManager, aferef_cfg);

    const hs_loop = {
        HsDacCfg: {
            ExcitBuffGain,
            HsDacGain,
            HsDacUpdateRate: 7,
        },
        HsTiaCfg: { ...calCfg.HsTiaCfg },
        SWMatCfg: {
            Dswitch: AD5940.SWD_RCAL0,
            Pswitch: AD5940.SWP_RCAL0,
            Nswitch: AD5940.SWN_RCAL1,
            Tswitch: AD5940.SWT_RCAL1 | AD5940.SWT_TRTIA,
        },
        WgCfg: {
            WgType: AD5940.WGTYPE_SIN,
            GainCalEn: false,
            OffsetCalEn: false,
            SinCfg: {
                SinFreqWord: ad5940_WGFreqWordCal(calCfg.fFreq, calCfg.SysClkFreq),
                SinAmplitudeWord: WgAmpWord,
                SinOffsetWord: 0,
                SinPhaseWord: 0,
            },
        },
    };
    await ad5940_HSDacCfgS(serialManager, hs_loop.HsDacCfg);
    await ad5940_HSTIACfgS(serialManager, hs_loop.HsTiaCfg);
    await ad5940_SWMatrixCfgS(serialManager, hs_loop.SWMatCfg);
    await ad5940_WGCfgS(serialManager, hs_loop.WgCfg);

    const dsp_cfg = {
        ADCBaseCfg: {
            ADCMuxN: AD5940.ADCMUXN_N_NODE,
            ADCMuxP: AD5940.ADCMUXP_P_NODE,
            ADCPga: AD5940.ADCPGA_1,
        },
        ADCFilterCfg: {
            ADCAvgNum: AD5940.ADCAVGNUM_16,
            ADCRate: bADCClk32MHzMode ? AD5940.ADCRATE_1P6MHZ : AD5940.ADCRATE_800KHZ,
            ADCSinc2Osr: calCfg.ADCSinc2Osr,
            ADCSinc3Osr: calCfg.ADCSinc3Osr,
            BpNotch: true,
            BpSinc3: false,
            DFTClkEnable: true,
            Sinc2NotchClkEnable: true,
            Sinc2NotchEnable: true,
            WGClkEnable: true,
        },
        DftCfg: { ...calCfg.DftCfg },
    };
    await ad5940_ADCBaseCfgS(serialManager, dsp_cfg.ADCBaseCfg);
    await ad5940_ADCFilterCfgS(serialManager, dsp_cfg.ADCFilterCfg);
    await ad5940_DFTCfgS(serialManager, dsp_cfg.DftCfg);

    await ad5940_AFECtrlS(
        serialManager,
        AD5940.AFECTRL_HSTIAPWR | AD5940.AFECTRL_INAMPPWR | AD5940.AFECTRL_EXTBUFPWR |
        AD5940.AFECTRL_DACREFPWR | AD5940.AFECTRL_HSDACPWR | AD5940.AFECTRL_SINC2NOTCH,
        true,
    );
    await ad5940_AFECtrlS(serialManager, AD5940.AFECTRL_WG | AD5940.AFECTRL_ADCPWR, true);
    await ad5940_AFECtrlS(serialManager, AD5940.AFECTRL_ADCCNV | AD5940.AFECTRL_DFT, true);

    while (!(await ad5940_INTCTestFlag(serialManager, AD5940.AFEINTC_1, AD5940.AFEINTSRC_DFTRDY))) { /* spin */ }

    await ad5940_AFECtrlS(
        serialManager,
        AD5940.AFECTRL_ADCCNV | AD5940.AFECTRL_DFT | AD5940.AFECTRL_WG | AD5940.AFECTRL_ADCPWR,
        false,
    );
    await ad5940_INTCClrFlag(serialManager, AD5940.AFEINTSRC_DFTRDY);

    const dftRcalRealResp = await serialManager.exchangeJsonRpc("rd", { address: AD5940.DFTREAL.address });
    const dftRcalImagResp = await serialManager.exchangeJsonRpc("rd", { address: AD5940.DFTIMAG.address });
    let DftRcal = {
        real: convertDftToInt(dftRcalRealResp.result),
        imag: convertDftToInt(dftRcalImagResp.result),
    };

    await ad5940_ADCMuxCfgS(serialManager, AD5940.ADCMUXP_HSTIA_P, AD5940.ADCMUXN_HSTIA_N);

    await ad5940_AFECtrlS(serialManager, AD5940.AFECTRL_WG | AD5940.AFECTRL_ADCPWR, true);
    await ad5940_AFECtrlS(serialManager, AD5940.AFECTRL_ADCCNV | AD5940.AFECTRL_DFT, true);

    while (!(await ad5940_INTCTestFlag(serialManager, AD5940.AFEINTC_1, AD5940.AFEINTSRC_DFTRDY))) { /* spin */ }

    await ad5940_AFECtrlS(
        serialManager,
        AD5940.AFECTRL_ADCCNV | AD5940.AFECTRL_DFT | AD5940.AFECTRL_WG | AD5940.AFECTRL_ADCPWR,
        false,
    );
    await ad5940_INTCClrFlag(serialManager, AD5940.AFEINTSRC_DFTRDY);

    const dftRtiaRealResp = await serialManager.exchangeJsonRpc("rd", { address: AD5940.DFTREAL.address });
    const dftRtiaImagResp = await serialManager.exchangeJsonRpc("rd", { address: AD5940.DFTIMAG.address });
    let DftRtia = {
        real: convertDftToInt(dftRtiaRealResp.result),
        imag: convertDftToInt(dftRtiaImagResp.result),
    };

    DftRtia.imag = -DftRtia.imag;
    DftRtia.real = -DftRtia.real;
    DftRtia.imag = -DftRtia.imag;
    DftRcal.imag = -DftRcal.imag;

    let res = complexDiv(DftRtia, DftRcal);
    res.real *= calCfg.fRcal;
    res.imag *= calCfg.fRcal;

    if (!calCfg.bPolarResult) {
        result.real = res.real;
        result.imag = res.imag;
    } else {
        result.Magnitude = complexMag(res.real, res.imag);
        result.Phase = complexPhase(res.real, res.imag);
    }
    return 0;
}

export function convertDftToInt(x) {
    if (x & 0x20000) {
        return (x | 0xFFFC0000) << 0;
    } else {
        return x & 0x3FFFF;
    }
}

export function complexMag(real, imag) {
    return Math.sqrt(real * real + imag * imag);
}

export function complexPhase(real, imag) {
    return Math.atan2(imag, real);
}

export function complexDiv(num, den) {
    const a = num.real, b = num.imag;
    const c = den.real, d = den.imag;
    const denom = c * c + d * d;
    return {
        real: (a * c + b * d) / denom,
        imag: (b * c - a * d) / denom,
    };
}

