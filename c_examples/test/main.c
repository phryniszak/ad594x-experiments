#include <stdio.h>
#include <stdint.h>
#include <unistd.h>
#include <sys/time.h>
#include <string.h>
#include <stdlib.h>

#include "ulog.h"
#include "ad5940.h"
#include "ad5940_serial.h"

int ad5940_test_register_rw(int fd, uint16_t address, uint32_t test_value)
{
	uint32_t read_value = 0;
	struct timeval start, end;
	gettimeofday(&start, NULL);

	if (ad5940_write_register(fd, address, test_value) != 0)
	{
		log_error("Write failed for address 0x%04X", address);
		return -1;
	}

	if (ad5940_read_register(fd, address, &read_value) != 0)
	{
		log_error("Read failed for address 0x%04X", address);
		return -1;
	}

	if (read_value != test_value)
	{
		log_error("Mismatch: wrote 0x%08X, read 0x%08X at address 0x%04X", test_value, read_value, address);
		return -1;
	}

	gettimeofday(&end, NULL);
	long elapsed_us = (end.tv_sec - start.tv_sec) * 1000000L + (end.tv_usec - start.tv_usec);
	log_info("Register 0x%04X test passed: value 0x%08X (time: %ld ms)", address, test_value, elapsed_us / 1000);
	return 0;
}

int ad5940_test_bit_functions(int fd, uint16_t address)
{
	uint32_t read_value = 0;
	int all_pass = 1;

	log_info("Starting ad5940_test_bit_functions test");

	ad5940_write_register(fd, address, 0);
	ad5940_set_bits_register(fd, address, 0x1);
	ad5940_read_register(fd, address, &read_value);
	if (read_value == 0x1)
	{
		log_info("set_bit 0 pass");
	}
	else
	{
		log_error("set_bit 0 failed: got 0x%08X", read_value);
		all_pass = 0;
	}

	ad5940_write_register(fd, address, 0);
	ad5940_set_bits_register(fd, address, 0x80000000);
	ad5940_read_register(fd, address, &read_value);
	if (read_value == 0x80000000)
	{
		log_info("set_bit 31 pass");
	}
	else
	{
		log_error("set_bit 31 failed: got 0x%08X", read_value);
		all_pass = 0;
	}

	ad5940_write_register(fd, address, 0xFFFFFFFF);
	ad5940_clr_bits_register(fd, address, 0x1);
	ad5940_read_register(fd, address, &read_value);
	if (read_value == 0xFFFFFFFE)
	{
		log_info("clear_bit 0 pass");
	}
	else
	{
		log_error("clear_bit 0 failed: got 0x%08X", read_value);
		all_pass = 0;
	}

	ad5940_write_register(fd, address, 0xFFFFFFFF);
	ad5940_clr_bits_register(fd, address, 0x80000000);
	ad5940_read_register(fd, address, &read_value);
	if (read_value == 0x7FFFFFFF)
	{
		log_info("clear_bit 31 pass");
	}
	else
	{
		log_error("clear_bit 31 failed: got 0x%08X", read_value);
		all_pass = 0;
	}

	ad5940_write_register(fd, address, 0x00000001);
	ad5940_set_bits_register(fd, address, 0x1);
	ad5940_read_register(fd, address, &read_value);
	if (read_value == 0x1)
	{
		log_info("set_bit already set bits pass");
	}
	else
	{
		log_error("set_bit already set bits failed: got 0x%08X", read_value);
		all_pass = 0;
	}

	ad5940_write_register(fd, address, 0xFFFFFFFE);
	ad5940_clr_bits_register(fd, address, 0x1);
	ad5940_read_register(fd, address, &read_value);
	if (read_value == 0xFFFFFFFE)
	{
		log_info("clear_bit already cleared bits pass");
	}
	else
	{
		log_error("clear_bit already cleared bits failed: got 0x%08X", read_value);
		all_pass = 0;
	}

	if (all_pass)
	{
		log_info("All bit function tests passed.");
		return 0;
	}

	log_error("Bit function tests failed.");
	return -1;
}

int main(int argc, char *argv[])
{
	ulog_set_level(LOG_TRACE);

	if (argc < 2)
	{
		fprintf(stderr, "add serial port as argument\n");
		return 1;
	}

	const char *serial_port = argv[1];

	log_info("Connecting to serial port %s", serial_port);

	int fd = open_serial_port(serial_port);
	if (fd < 0)
		return 1;

	ad5940_reset_hardware(fd);

	sleep(0.1);

	flush_serial_port(fd);

	ad5940_test_register_rw(fd, REG_AFE_CALDATLOCK, 0xFFFFFFFF);
	ad5940_test_register_rw(fd, REG_AFE_CALDATLOCK, 0x00000001);
	ad5940_test_register_rw(fd, REG_AFE_CALDATLOCK, 0x7FFFFFFF);
	ad5940_test_register_rw(fd, REG_AFE_CALDATLOCK, 0xAAAAAAAA);
	ad5940_test_register_rw(fd, REG_AFE_CALDATLOCK, 0x55555555);
	ad5940_test_register_rw(fd, REG_AFE_CALDATLOCK, 0x12345678);
	ad5940_test_register_rw(fd, REG_AFE_CALDATLOCK, 0x87654321);
	ad5940_test_register_rw(fd, REG_AFE_CALDATLOCK, 0x09040ADF);
	ad5940_test_register_rw(fd, REG_AFE_CALDATLOCK, 0xDEADBEAF);
	ad5940_test_register_rw(fd, REG_AFE_CALDATLOCK, 0x00000000);
	ad5940_test_register_rw(fd, REG_AFE_CALDATLOCK, 0x40000000);

	ad5940_test_bit_functions(fd, REG_AFE_CALDATLOCK);

	close(fd);
	return 0;
}
