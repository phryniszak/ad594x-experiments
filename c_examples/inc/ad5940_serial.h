#ifndef _AD5940_SERIAL_H_
#define _AD5940_SERIAL_H_

#include <stdint.h>

int open_serial_port(const char *device);
void close_serial_port(int fd);
int flush_serial_port(int fd);

int ad5940_reset_hardware(int fd);
int ad5940_read_register(int fd, uint16_t address, uint32_t *value);
int ad5940_write_register(int fd, uint16_t address, uint32_t value);

int ad5940_set_bits_register(int fd, uint16_t address, uint32_t value);
int ad5940_clr_bits_register(int fd, uint16_t address, uint32_t value);

int ad5940_wr_mask_register(int fd, uint16_t address, uint32_t mask, uint32_t value);
int ad5940_rd_fifo(int fd, uint32_t readcount, uint32_t *buffer);

#endif // __AD5940_SERIAL__