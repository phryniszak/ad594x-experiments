import { AD5940 } from "./ad5940_reg.js";

export async function testWrite(serialManager, value) {
    try {
        const response = await serialManager.exchangeJsonRpc("wr", {
            address: AD5940.CALDATLOCK.address,
            data: value,
        });
        return response;
    } catch (e) {
        serialManager.logToTerminal(`Write failed: ${e.message}`, "error");
        return null;
    }
}

export async function testRead(serialManager) {
    try {
        const response = await serialManager.exchangeJsonRpc("rd", {
            address: AD5940.CALDATLOCK.address,
        });
        return response;
    } catch (e) {
        serialManager.logToTerminal(`Read failed: ${e.message}`, "error");
        return null;
    }
}

export async function test_set_bits(serialManager, value) {
    try {
        const response = await serialManager.exchangeJsonRpc("set_bits", {
            address: AD5940.CALDATLOCK.address,
            data: value,
        });
        return response;
    } catch (e) {
        serialManager.logToTerminal(`Set_bits failed: ${e.message}`, "error");
        return null;
    }
}

export async function test_clr_bits(serialManager, value) {
    try {
        const response = await serialManager.exchangeJsonRpc("clr_bits", {
            address: AD5940.CALDATLOCK.address,
            data: value,
        });
        return response;
    } catch (e) {
        serialManager.logToTerminal(`Clr_bits failed: ${e.message}`, "error");
        return null;
    }
}

export async function testWriteReadRandom(serialManager, iterations = 50) {

    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
        const randomValue = (Math.floor(Math.random() * 0x80000000) >>> 0) + 0x80000000;

        await testWrite(serialManager, randomValue);

        const readResponse = await testRead(serialManager);

        const readValue = readResponse && (readResponse.result ?? readResponse.value);

        if (readValue === randomValue) {
            serialManager.logToTerminal(
                `Test ${i + 1}: PASS (Wrote 0x${randomValue.toString(16)}, Read 0x${readValue?.toString(16)})`,
                "success",
            );
        } else {
            serialManager.logToTerminal(
                `Test ${i + 1}: FAIL (Wrote 0x${randomValue.toString(16)}, Read 0x${readValue?.toString(16)})`,
                "error",
            );
        }
    }

    const endTime = performance.now();

    const duration = ((endTime - startTime) / 1000).toFixed(3);
    const one_loop = ((endTime - startTime) / (1000 * iterations)).toFixed(3);
    serialManager.logToTerminal(`testWriteReadRandom finished in ${duration} seconds`, "info");
    serialManager.logToTerminal(`one write/read loop takes ${one_loop} seconds`, "info");
}

export async function test_bit_functions(serialManager) {

    let all_pass = true;

    serialManager.logToTerminal("Starting test_bit_functions test", "info");

    await testWrite(serialManager, 0);
    await test_set_bits(serialManager, 0x1);
    let readResp = await testRead(serialManager);
    if (readResp.result === 0x1) {
        serialManager.logToTerminal("set_bit 0 pass", "success");
    } else {
        serialManager.logToTerminal(`set_bit 0 failed: got 0x${readResp?.result.toString(16)}`, "error");
        all_pass = false;
    }

    await testWrite(serialManager, 0);
    await test_set_bits(serialManager, 0x80000000);
    readResp = await testRead(serialManager);
    if (readResp.result === 0x80000000) {
        serialManager.logToTerminal("set_bit 31 pass", "success");
    } else {
        serialManager.logToTerminal(`set_bit 31 failed: got 0x${readResp?.result.toString(16)}`, "error");
        all_pass = false;
    }

    await testWrite(serialManager, 0xFFFFFFFF);
    await test_clr_bits(serialManager, 0x1);
    readResp = await testRead(serialManager);
    if (readResp.result === 0xFFFFFFFE) {
        serialManager.logToTerminal("clear_bit 0 pass", "success");
    } else {
        serialManager.logToTerminal(`clear_bit 0 failed: got 0x${readResp?.result.toString(16)}`, "error");
        all_pass = false;
    }

    await testWrite(serialManager, 0xFFFFFFFF);
    await test_clr_bits(serialManager, 0x80000000);
    readResp = await testRead(serialManager);
    if (readResp.result === 0x7FFFFFFF) {
        serialManager.logToTerminal("clear_bit 31 pass", "success");
    } else {
        serialManager.logToTerminal(`clear_bit 31 failed: got 0x${readResp?.result.toString(16)}`, "error");
        all_pass = false;
    }

    await testWrite(serialManager, 0x00000001);
    await test_set_bits(serialManager, 0x1);
    readResp = await testRead(serialManager);
    if (readResp.result === (0x1)) {
        serialManager.logToTerminal("set_bit already set bits pass", "success");
    } else {
        serialManager.logToTerminal(`set_bit already set bits failed: got 0x${readResp?.result.toString(16)}`, "error");
        all_pass = false;
    }

    await testWrite(serialManager, 0xFFFFFFFE);
    await test_clr_bits(serialManager, 0x1);
    readResp = await testRead(serialManager);
    if (readResp.result === 0xFFFFFFFE) {
        serialManager.logToTerminal("clear_bit already cleared bits pass", "success");
    } else {
        serialManager.logToTerminal(`clear_bit already cleared bits failed: got 0x${readResp?.result.toString(16)}`, "error");
        all_pass = false;
    }

    if (all_pass) {
        serialManager.logToTerminal("All bit function tests passed.", "success");
    } else {
        serialManager.logToTerminal("bit function tests failed.", "error");
    };
}