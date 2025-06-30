#include <stdio.h>
#include <unistd.h>

#include "ulog.h"

#include "ad5940.h"
#include "impedance.h"

struct ad5940_dev ad594x = {0};

void log_init(void)
{
    ulog_set_level(LOG_TRACE);
    FILE *fp = fopen("log.txt", "w");
    if (fp)
    {
        ulog_add_fp(fp, LOG_TRACE);
    }
}

void structInit(void)
{
    app_impedance_t *p_cfg;

    app_get_cfg(&p_cfg);

    p_cfg->SinFreq = 1000;
    p_cfg->HstiaRtiaSel = HSTIARTIA_5K;
    p_cfg->RtiaCurrValue = (fImpCar_Type){5000, 0};
    p_cfg->RcalVal = 10000.0;
}

int main(int argc, char *argv[])
{
    log_init();

    log_info("Build Time:%s", __TIME__);

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

    structInit();

    ret |= app_RTIA_cal(&ad594x);

    return 0;

    fImpCar_Type impedance;

    ret |= app_ad_init(&ad594x);
    ret |= app_measure(&ad594x, &impedance);
    ret |= app_measure(&ad594x, &impedance);

    log_info("*** sweep frequency ***");

    SoftSweepCfg_Type SweepCfg = {
        .SweepEn = true,
        .SweepIndex = 0,
        .SweepLog = false,
        .SweepPoints = 5,
        .SweepStart = 1000,
        .SweepStop = 150000};

    app_impedance_t *p_cfg;
    app_get_cfg(&p_cfg);

    for (int i = 0; i < SweepCfg.SweepPoints; i++)
    {
        ad5940_SweepNext(&ad594x, &SweepCfg, &p_cfg->SinFreq);
        log_info("frequency: %dHz", (int)p_cfg->SinFreq);
        ret |= app_ad_init(&ad594x);
        ret |= app_measure(&ad594x, &impedance);
    }

    ret = ad5940_remove(&ad594x);

    return 0;
}