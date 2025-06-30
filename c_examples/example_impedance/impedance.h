#ifndef _IMPEDANCE_H_
#define _IMPEDANCE_H_
#include "ad5940.h"
#include "stdio.h"
#include "string.h"
#include "math.h"

#define AD5940ERR_OK 0
#define AD5940ERR_ERROR -1
#define AD5940ERR_PARA -2
#define AD5940ERR_NULLP -3
#define AD5940ERR_BUFF -4
#define AD5940ERR_ADDROR -5
#define AD5940ERR_SEQGEN -6
#define AD5940ERR_SEQREG -7
#define AD5940ERR_SEQLEN -8
#define AD5940ERR_WAKEUP -9
#define AD5940ERR_TIMEOUT -10
#define AD5940ERR_CALOR -11
#define AD5940ERR_APPERROR -100
#define AD5940ERR_LOOP_OVER -101

typedef struct
{
    float SysClkFreq;
    float AdcClkFreq;
    float SinFreq;
    float RcalVal;
    uint32_t VoutPP;
    uint8_t ADCSinc3Osr;
    uint8_t ADCSinc2Osr;
    uint32_t HstiaRtiaSel;
    uint32_t CtiaSel;
    uint32_t DftNum;
    uint32_t DftSrc;
    fImpCar_Type RtiaCurrValue;
} app_impedance_t;

int app_get_cfg(void *pCfg);
int app_RTIA_cal(struct ad5940_dev *dev);
int app_ad_init(struct ad5940_dev *dev);
int app_measure(struct ad5940_dev *dev, fImpCar_Type *pImpedance);

#endif
