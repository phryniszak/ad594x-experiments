#include <stdio.h>
#include <unistd.h>

#include "ulog.h"

#include "ad5940.h"

struct ad5940_dev ad594x = {0};

int AppRtiaCal(struct ad5940_dev *dev, uint32_t freq, bool polar)
{
    int ret;

    HSRTIACal_Type hsrtia_cal;
    hsrtia_cal.AdcClkFreq = 16000000.0;
    hsrtia_cal.ADCSinc2Osr = ADCSINC2OSR_22;
    hsrtia_cal.ADCSinc3Osr = ADCSINC3OSR_2;
    hsrtia_cal.DftCfg.DftNum = DFTNUM_16384;
    hsrtia_cal.DftCfg.DftSrc = DFTSRC_SINC3;
    hsrtia_cal.DftCfg.HanWinEn = true;
    hsrtia_cal.fRcal = 10000.0;
    hsrtia_cal.HsTiaCfg.DiodeClose = false;
    hsrtia_cal.HsTiaCfg.HstiaBias = HSTIABIAS_1P1;
    hsrtia_cal.HsTiaCfg.HstiaCtia = 16;
    hsrtia_cal.HsTiaCfg.HstiaDeRload = HSTIADERLOAD_OPEN;
    hsrtia_cal.HsTiaCfg.HstiaDeRtia = HSTIADERTIA_TODE;
    hsrtia_cal.HsTiaCfg.HstiaRtiaSel = HSTIARTIA_10K;
    hsrtia_cal.SysClkFreq = 16000000.0;
    hsrtia_cal.bPolarResult = polar;
    hsrtia_cal.fFreq = freq;
    float rtiaValue[2];
    ret = ad5940_HSRtiaCal(dev, &hsrtia_cal, rtiaValue);

    if (polar)
        log_info("Rtia polar representation=(%f,%f)", rtiaValue[0], rtiaValue[1]);
    else
        log_info("Rtia complex representation=(%f,%f)", rtiaValue[0], rtiaValue[1]);

    return ret;
}

void log_init(void)
{
    ulog_set_level(LOG_INFO);
    FILE *fp = fopen("log.txt", "w");
    if (fp)
    {
        ulog_add_fp(fp, LOG_TRACE);
    }
}

int main(int argc, char *argv[])
{
    ulog_set_level(LOG_INFO);

    if (argc < 2)
    {
        fprintf(stderr, "add serial port as argument\n");
        return 1;
    }

    const char *serial_port = argv[1];

    log_info("Connecting to serial port %s", serial_port);

    ad594x.serial_port_name = serial_port;
    int32_t ret = ad5940_init(&ad594x);
    if (ret < 0)
    {
        log_error("AD5940 init failed %d", ret);
        return -1;
    }

    for (size_t i = 0; i < 10; i++)
    {
        AppRtiaCal(&ad594x, 1000, true);
        AppRtiaCal(&ad594x, 100000, true);
        AppRtiaCal(&ad594x, 1000, false);
        AppRtiaCal(&ad594x, 100000, false);

        sleep(0.1);
        log_info("tick");
    }

    return 0;
}