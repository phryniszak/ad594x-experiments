export class SerialPortManager {

    #encoder = new TextEncoder();
    #port = null;
    #id = 0;
    #terminal = document.getElementById("terminal");

    constructor() { }

    logToTerminal(message, type = "default") {
        const logElement = document.createElement("div");
        logElement.textContent = message;
        logElement.className = `log-${type}`;
        this.#terminal.appendChild(logElement);
        this.#terminal.scrollTop = this.#terminal.scrollHeight;
    }

    clearTerminal() {
        this.#terminal.innerHTML = "";
    }

    async openPort() {
        try {
            this.#port = await navigator.serial.requestPort();
            await this.#port.open({ baudRate: 9600 });
            this.logToTerminal("Serial port opened.", "success");
        } catch (error) {
            console.error("Error opening serial port:", error);
            this.logToTerminal(`Error: ${error.message}`, "error");
            this.closePort();
            return false;
        }
        return true;
    }

    async closePort() {
        try {
            if (this.#port) {
                await this.#port.close();
                this.#port = null;
                this.logToTerminal("Serial port closed.", "success");
            }
        } catch (error) {
            console.error("Error closing serial port:", error);
            this.logToTerminal(`Error: ${error.message}`, "error");
        }
    }

    async readJson(timeoutMs = 50) {
        const reader = this.#port.readable.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let jsonStarted = false;
        let braceCount = 0;
        const startTime = Date.now();

        try {
            while (true) {
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs));

                const { value, done } = await Promise.race([
                    reader.read(),
                    timeoutPromise,
                ]);

                if (done || !value) { break; };

                const chunk = decoder.decode(value, { stream: true });

                for (let char of chunk) {
                    if (char === "{") {
                        if (!jsonStarted) {
                            jsonStarted = true;
                            buffer = "";
                            braceCount = 0;
                        }
                        braceCount++;
                    }

                    if (jsonStarted) {
                        buffer += char;

                        if (char === "}") {
                            braceCount--;
                            if (braceCount === 0) {
                                try {
                                    const json = JSON.parse(buffer);
                                    reader.releaseLock();
                                    return json;
                                } catch (e) {
                                    console.warn("Invalid JSON:", buffer);
                                    jsonStarted = false;
                                }
                            }
                        }
                    }
                }

                if (Date.now() - startTime > timeoutMs) {
                    throw new Error("Timeout waiting for complete JSON");
                }
            }
        } catch (err) {
            console.error(err.message);
        } finally {
            reader.releaseLock();
        }

        return null;
    }

    async write(str) {
        if (this.#port?.writable === null) {
            console.warn("unable to find writable port");
            return;
        }

        const writer = this.#port.writable.getWriter();
        writer.write(this.#encoder.encode(str));
        writer.releaseLock();
    }

    async exchangeJsonRpc(method, params = {}, id = null, force_uint32 = true) {

        if (!id) {
            id = this.#id++;
        }


        if (!this.#port) {
            this.logToTerminal("Error: Serial Port not open.", "error");
            return null;
        }

        const command = {
            method,
            id,
        };

        if (params && Object.keys(params).length > 0) {
            command.params = params;
        }

        if (force_uint32 && params && typeof params === "object") {
            ["address", "data", "mask"].forEach((key) => {
                if (params.hasOwnProperty(key)) {
                    params[key] = Number(params[key]) >>> 0;
                }
            });
        }

        const commandString = JSON.stringify(command);
        await this.write(commandString);
        const jsonResponse = await this.readJson();
        if (!jsonResponse) {
            this.logToTerminal("Error: No valid JSON frame received", "error");
            throw new Error("No valid JSON frame received");
        }
        if (id !== jsonResponse.id) {
            this.logToTerminal(`Error: Mismatched response ID: expected ${id}, got ${jsonResponse.id}`, "error");
            throw new Error(`Mismatched response ID: expected ${id}, got ${jsonResponse.id}`);
        }
        if (jsonResponse.error) {
            this.logToTerminal(`Error: ${JSON.stringify(jsonResponse.error)}`, "error");
            throw new Error(`Error: ${JSON.stringify(jsonResponse.error)}`);
        }
        return jsonResponse;
    }
}
