#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <termios.h>
#include <errno.h>
#include "cJSON.h"
#include <sys/select.h>
#include <sys/time.h>
#include <time.h>

#include "ad5940.h"
#include "ulog.h"

#define BAUDRATE B115200
#define READ_BUFFER_SIZE (1024 * 8)
#define READ_BUFFER_FIFO_SIZE (1024 * 64)
#define READ_TIMEOUT 100

static int id = 0;

int open_serial_port(const char *device)
{
	int fd = open(device, O_RDWR | O_NOCTTY | O_SYNC | O_NONBLOCK);
	if (fd < 0)
	{
		log_error("fail to open serial port");
		return -1;
	}

	struct termios tty = {0};
	if (tcgetattr(fd, &tty) != 0)
	{
		log_error("tcgetattr");
		close(fd);
		return -1;
	}

	cfsetospeed(&tty, BAUDRATE);
	cfsetispeed(&tty, BAUDRATE);

	tty.c_cflag = (tty.c_cflag & ~CSIZE) | CS8;
	tty.c_iflag &= ~IGNBRK;
	tty.c_lflag = 0;
	tty.c_oflag = 0;
	tty.c_cc[VMIN] = 0;
	tty.c_cc[VTIME] = 0; // 1; // 0.1 second timeout

	tty.c_iflag &= ~(IXON | IXOFF | IXANY);
	tty.c_cflag |= (CLOCAL | CREAD);
	tty.c_cflag &= ~(PARENB | PARODD);
	tty.c_cflag &= ~CSTOPB;
	tty.c_cflag &= ~CRTSCTS;

	if (tcsetattr(fd, TCSANOW, &tty) != 0)
	{
		perror("tcsetattr");
		close(fd);
		return -1;
	}

	return fd;
}

int flush_serial_port(int fd)
{
	if (tcflush(fd, TCIOFLUSH) == -1)
	{
		log_error("tcflush failed");
		return -1;
	}
	return 0;
}

void close_serial_port(int fd)
{
	if (fd >= 0)
	{
		close(fd);
	}
}

char *build_json_rpc_request(const char *method, cJSON *params, int id)
{
	cJSON *root = cJSON_CreateObject();
	// cJSON_AddStringToObject(root, "jsonrpc", "2.0");
	cJSON_AddStringToObject(root, "method", method);
	cJSON_AddItemToObject(root, "params", params);
	cJSON_AddNumberToObject(root, "id", id);

	char *json_str = cJSON_PrintUnformatted(root);
	cJSON_Delete(root);
	return json_str;
}

int send_request(int fd, const char *json_str)
{
	size_t len = strlen(json_str);
	write(fd, json_str, len);
	// write(fd, "\n", 1); // newline to indicate end of message
	log_trace("Sent: %s", json_str);
	return 0;
}

int parse_json_rpc_response(const char *json_str, int expected_id, uint32_t *value, const char *expected_str)
{
	cJSON *root = cJSON_Parse(json_str);
	if (!root)
	{
		log_warn("Invalid JSON received");
		return -1;
	}

	cJSON *id = cJSON_GetObjectItem(root, "id");
	if (!id || !cJSON_IsNumber(id) || id->valueint != expected_id)
	{
		log_warn("Response ID mismatch or missing (expected %d, got %d)", expected_id, id ? id->valueint : -1);
		cJSON_Delete(root);
		return -1;
	}

	cJSON *error = cJSON_GetObjectItem(root, "error");
	if (error)
	{
		char *error_str = cJSON_Print(error);
		log_warn("Error: %s", error_str);
		free(error_str);
		cJSON_Delete(root);
		return -1;
	}

	cJSON *result = cJSON_GetObjectItem(root, "result");
	if (result)
	{
		if (value && cJSON_IsNumber(result))
		{
			*value = (uint32_t)result->valuedouble;
			cJSON_Delete(root);
			return 0;
		}
		if (expected_str && cJSON_IsString(result) && result->valuestring)
		{
			int cmp = strcmp(result->valuestring, expected_str);
			if (cmp == 0)
			{
				cJSON_Delete(root);
				return 0;
			}
			else
			{
				log_warn("Result string mismatch: expected '%s', got '%s'", expected_str, result->valuestring);
				cJSON_Delete(root);
				return -1;
			}
		}
	}

	log_warn("No valid result in response.");
	cJSON_Delete(root);
	return -1;
}

int receive_response(int fd, char *buffer, size_t max_len, int timeout_ms)
{
	int total = 0;
	int brace_level = 0;
	int in_json = 0;
	char c;
	struct timeval start, now;
	gettimeofday(&start, NULL);

	while (total < max_len - 1)
	{
		fd_set readfds;
		FD_ZERO(&readfds);
		FD_SET(fd, &readfds);

		struct timeval timeout;
		timeout.tv_sec = timeout_ms / 1000;
		timeout.tv_usec = (timeout_ms % 1000) * 1000;

		int ret = select(fd + 1, &readfds, NULL, NULL, &timeout);
		if (ret < 0)
		{
			perror("select");
			return -1;
		}
		else if (ret == 0)
		{
			// timeout
			break;
		}

		int n = read(fd, &c, 1);
		if (n <= 0)
		{
			break;
		}

		if (c == '{')
		{
			if (!in_json)
				in_json = 1;
			brace_level++;
		}
		else if (c == '}')
		{
			brace_level--;
		}

		if (in_json)
			buffer[total++] = c;

		// Full JSON object received
		if (in_json && brace_level == 0)
			break;

		// Safety: exit if total time exceeds timeout
		gettimeofday(&now, NULL);
		int elapsed_ms = (now.tv_sec - start.tv_sec) * 1000 +
						 (now.tv_usec - start.tv_usec) / 1000;
		if (elapsed_ms > timeout_ms)
			break;
	}

	buffer[total] = '\0';
	return total;
}

int ad5940_reset_hardware(int fd)
{
	// Build request
	char *json_request = build_json_rpc_request("reset", NULL, ++id);

	// Send
	send_request(fd, json_request);
	free(json_request);

	// Receive response
	char recv_buf[READ_BUFFER_SIZE];
	if (receive_response(fd, recv_buf, sizeof(recv_buf), READ_TIMEOUT) > 0)
	{
		log_trace("Received: %s", recv_buf);
		return parse_json_rpc_response(recv_buf, id, NULL, "done");
	}
	else
	{
		log_warn("No response or timeout.");
	}
	return -1;
}

int ad5940_write_register(int fd, uint16_t address, uint32_t value)
{
	cJSON *params = cJSON_CreateObject();
	cJSON_AddNumberToObject(params, "address", address);
	cJSON_AddNumberToObject(params, "data", value);

	// Build request
	char *json_request = build_json_rpc_request("wr", params, ++id);

	// Send
	send_request(fd, json_request);
	free(json_request);

	// Receive response
	char recv_buf[READ_BUFFER_SIZE];
	if (receive_response(fd, recv_buf, sizeof(recv_buf), READ_TIMEOUT) > 0)
	{
		log_trace("Received: %s", recv_buf);
		return parse_json_rpc_response(recv_buf, id, NULL, "done");
	}
	else
	{
		log_warn("No response or timeout.");
	}
	return -1;
}

/**
 * @brief Read a value from a register via JSON-RPC over serial.
 * @param fd Serial port file descriptor.
 * @param address Register address.
 * @param value Pointer to store the read value.
 * @return 0 on success, -1 on error.
 */
int ad5940_read_register(int fd, uint16_t address, uint32_t *value)
{
	cJSON *params = cJSON_CreateObject();
	cJSON_AddNumberToObject(params, "address", address);

	// Build request
	char *json_request = build_json_rpc_request("rd", params, ++id);

	// Send
	send_request(fd, json_request);
	free(json_request);

	// Receive response
	char recv_buf[READ_BUFFER_SIZE];
	if (receive_response(fd, recv_buf, sizeof(recv_buf), READ_TIMEOUT) > 0)
	{
		log_trace("Received: %s", recv_buf);
		return parse_json_rpc_response(recv_buf, id, value, NULL);
	}
	else
	{
		log_warn("No response or timeout.");
		return -1;
	}
}

/**
 * @brief Set bits in a register via JSON-RPC over serial.
 * @param fd Serial port file descriptor.
 * @param address Register address.
 * @param value mask value
 * @return 0 on success, -1 on error.
 */
int ad5940_set_bits_register(int fd, uint16_t address, uint32_t value)
{
	cJSON *params = cJSON_CreateObject();
	cJSON_AddNumberToObject(params, "address", address);
	cJSON_AddNumberToObject(params, "data", value);

	// Build request
	char *json_request = build_json_rpc_request("set_bits", params, ++id);

	// Send
	send_request(fd, json_request);
	free(json_request);

	// Receive response
	char recv_buf[READ_BUFFER_SIZE];
	if (receive_response(fd, recv_buf, sizeof(recv_buf), READ_TIMEOUT) > 0)
	{
		log_trace("Received: %s", recv_buf);
		return parse_json_rpc_response(recv_buf, id, NULL, "done");
	}
	else
	{
		log_warn("No response or timeout.");
		return -1;
	}
}

/**
 * @brief Clear bits in a register via JSON-RPC over serial.
 * @param fd Serial port file descriptor.
 * @param address Register address.
 * @param value mask value
 * @return 0 on success, -1 on error.
 */
int ad5940_clr_bits_register(int fd, uint16_t address, uint32_t value)
{
	cJSON *params = cJSON_CreateObject();
	cJSON_AddNumberToObject(params, "address", address);
	cJSON_AddNumberToObject(params, "data", value);

	// Build request
	char *json_request = build_json_rpc_request("clr_bits", params, ++id);

	// Send
	send_request(fd, json_request);
	free(json_request);

	// Receive response
	char recv_buf[READ_BUFFER_SIZE];
	if (receive_response(fd, recv_buf, sizeof(recv_buf), READ_TIMEOUT) > 0)
	{
		log_trace("Received: %s", recv_buf);
		return parse_json_rpc_response(recv_buf, id, NULL, "done");
	}
	else
	{
		log_warn("No response or timeout.");
		return -1;
	}
}

/**
 * @brief Write masked value to a register via JSON-RPC over serial.
 * @param fd Serial port file descriptor.
 * @param address Register address.
 * @param mask Mask to apply.
 * @param value Value to write (masked).
 * @return 0 on success, -1 on error.
 */
int ad5940_wr_mask_register(int fd, uint16_t address, uint32_t mask, uint32_t value)
{
	cJSON *params = cJSON_CreateObject();
	cJSON_AddNumberToObject(params, "address", address);
	cJSON_AddNumberToObject(params, "mask", mask);
	cJSON_AddNumberToObject(params, "data", value);

	// Build request
	char *json_request = build_json_rpc_request("wr_mask", params, ++id);

	// Send
	send_request(fd, json_request);
	free(json_request);

	// Receive response
	char recv_buf[READ_BUFFER_SIZE];
	if (receive_response(fd, recv_buf, sizeof(recv_buf), READ_TIMEOUT) > 0)
	{
		log_trace("Received: %s", recv_buf);
		return parse_json_rpc_response(recv_buf, id, NULL, "done");
	}
	else
	{
		log_warn("No response or timeout.");
		return -1;
	}
}

/**
 * @brief Read FIFO values via JSON-RPC over serial.
 * @param fd Serial port file descriptor.
 * @param readcount Number of FIFO values to read.
 * @param buffer Pointer to buffer to store the read values (must be at least readcount elements).
 * @return Number of values read on success, -1 on error.
 */
int ad5940_rd_fifo(int fd, uint32_t readcount, uint32_t *buffer)
{
	cJSON *params = cJSON_CreateObject();
	cJSON_AddNumberToObject(params, "readcount", readcount);

	// Build request
	char *json_request = build_json_rpc_request("rd_fifo", params, ++id);

	// Send
	send_request(fd, json_request);
	free(json_request);

	// Receive response
	char recv_buf[READ_BUFFER_FIFO_SIZE];
	if (receive_response(fd, recv_buf, sizeof(recv_buf), READ_TIMEOUT) > 0)
	{
		log_trace("Received: %s", recv_buf);

		cJSON *root = cJSON_Parse(recv_buf);
		if (!root)
		{
			log_warn("Invalid JSON received");
			return -1;
		}

		cJSON *id_item = cJSON_GetObjectItem(root, "id");
		if (!id_item || !cJSON_IsNumber(id_item) || id_item->valueint != id)
		{
			log_warn("Response ID mismatch or missing (expected %d, got %d)", id, id_item ? id_item->valueint : -1);
			cJSON_Delete(root);
			return -1;
		}

		cJSON *error = cJSON_GetObjectItem(root, "error");
		if (error)
		{
			char *error_str = cJSON_Print(error);
			log_warn("Error: %s", error_str);
			free(error_str);
			cJSON_Delete(root);
			return -1;
		}

		cJSON *result = cJSON_GetObjectItem(root, "result");
		if (!result || !cJSON_IsArray(result))
		{
			log_warn("No valid result array in response.");
			cJSON_Delete(root);
			return -1;
		}

		int n = cJSON_GetArraySize(result);
		if ((uint32_t)n > readcount)
			n = readcount;
		for (int i = 0; i < n; ++i)
		{
			cJSON *item = cJSON_GetArrayItem(result, i);
			if (cJSON_IsNumber(item))
				buffer[i] = (uint32_t)item->valuedouble;
			else
				buffer[i] = 0;
		}
		cJSON_Delete(root);
		return n;
	}
	else
	{
		log_warn("No response or timeout.");
		return -1;
	}
}