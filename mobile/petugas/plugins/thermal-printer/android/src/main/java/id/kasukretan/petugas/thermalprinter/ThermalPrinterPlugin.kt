package id.kasukretan.petugas.thermalprinter

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothSocket
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.IOException
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = [
        Permission(
            strings = [
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN
            ],
            alias = "bluetooth"
        )
    ]
)
class ThermalPrinterPlugin : Plugin() {
    companion object {
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        private const val PREFS = "kasukretan_thermal_printer"
        private const val KEY_ADDRESS = "address"
        private const val KEY_NAME = "name"
        private const val KEY_TRANSPORT = "transport"
        private const val KEY_SMALL_CHUNK = "small_chunk"

        private val BLE_SERVICES = listOf(
            UUID.fromString("000018f0-0000-1000-8000-00805f9b34fb"),
            UUID.fromString("49535343-fe7d-4ae8-8f69-9a5752655250"),
            UUID.fromString("e7810a71-73ae-499d-8c15-faa9aef0c3f2"),
            UUID.fromString("0000ff00-0000-1000-8000-00805f9b34fb"),
            UUID.fromString("0000ffe0-0000-1000-8000-00805f9b34fb"),
            UUID.fromString("0000ae30-0000-1000-8000-00805f9b34fb"),
            UUID.fromString("0000fee7-0000-1000-8000-00805f9b34fb"),
            UUID.fromString("0000ff12-0000-1000-8000-00805f9b34fb"),
        )

        private val BLE_WRITE_CHARS = listOf(
            UUID.fromString("00002af1-0000-1000-8000-00805f9b34fb"),
            UUID.fromString("49535344-fe7d-4ae8-8f69-9a5752655250"),
            UUID.fromString("bef8d6c9-9c21-4c9e-b632-ba34139b7b4b"),
            UUID.fromString("0000ff02-0000-1000-8000-00805f9b34fb"),
            UUID.fromString("0000ffe1-0000-1000-8000-00805f9b34fb"),
            UUID.fromString("0000ae01-0000-1000-8000-00805f9b34fb"),
            UUID.fromString("0000fec7-0000-1000-8000-00805f9b34fb"),
            UUID.fromString("0000ff01-0000-1000-8000-00805f9b34fb"),
        )

        private const val CHUNK_SIZE = 100
        private const val SMALL_CHUNK_SIZE = 20
        private const val CHUNK_DELAY_MS = 20L
        private const val CONNECT_TIMEOUT_MS = 12_000L
        private const val WRITE_RECOVERY_ATTEMPTS = 2
    }

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    private var sppSocket: BluetoothSocket? = null
    private var sppOut: OutputStream? = null
    private var gatt: BluetoothGatt? = null
    private var writeChar: BluetoothGattCharacteristic? = null
    private var activeTransport: String? = null
    private var activeAddress: String? = null
    private var activeName: String? = null

    private fun prefs() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun adapter(): BluetoothAdapter? {
        val mgr = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        return mgr.adapter
    }

    private fun hasBluetoothPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
                PackageManager.PERMISSION_GRANTED &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    private fun ensurePermission(call: PluginCall, cont: () -> Unit) {
        if (hasBluetoothPermission()) {
            cont()
            return
        }
        requestPermissionForAlias("bluetooth", call, "bluetoothPermsCallback")
    }

    @PermissionCallback
    private fun bluetoothPermsCallback(call: PluginCall) {
        if (hasBluetoothPermission()) {
            // Re-dispatch by method name is awkward; reject and ask caller to retry once.
            call.reject("Izin Bluetooth diberikan. Tap lagi untuk melanjutkan.")
        } else {
            call.reject("Izin Bluetooth diperlukan untuk mencetak.")
        }
    }

    private fun deviceToJson(device: BluetoothDevice, bonded: Boolean = false): JSObject {
        val obj = JSObject()
        @SuppressLint("MissingPermission")
        val name = try {
            device.name?.trim().orEmpty().ifEmpty { "Printer thermal" }
        } catch (_: SecurityException) {
            "Printer thermal"
        }
        obj.put("address", device.address)
        obj.put("name", name)
        obj.put("bonded", bonded)
        obj.put("transportHint", "unknown")
        return obj
    }

    private fun emitConnection(connected: Boolean) {
        val data = JSObject()
        data.put("connected", connected)
        notifyListeners("connectionChange", data)
    }

    private fun savePrinter(address: String, name: String, transport: String) {
        prefs().edit()
            .putString(KEY_ADDRESS, address)
            .putString(KEY_NAME, name)
            .putString(KEY_TRANSPORT, transport)
            .apply()
        activeAddress = address
        activeName = name
        activeTransport = transport
    }

    private fun clearActiveLink() {
        try {
            sppOut?.close()
        } catch (_: Exception) {
        }
        try {
            sppSocket?.close()
        } catch (_: Exception) {
        }
        sppOut = null
        sppSocket = null
        try {
            gatt?.close()
        } catch (_: Exception) {
        }
        gatt = null
        writeChar = null
        emitConnection(false)
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", true)
        call.resolve(ret)
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    fun listBonded(call: PluginCall) {
        ensurePermission(call) {
            executor.execute {
                try {
                    val adapter = adapter()
                        ?: throw IllegalStateException("Bluetooth tidak tersedia di perangkat ini.")
                    if (!adapter.isEnabled) {
                        throw IllegalStateException("Bluetooth HP belum diaktifkan.")
                    }
                    val arr = JSArray()
                    adapter.bondedDevices?.forEach { d ->
                        arr.put(deviceToJson(d, bonded = true))
                    }
                    val ret = JSObject()
                    ret.put("devices", arr)
                    call.resolve(ret)
                } catch (e: Exception) {
                    call.reject(e.message ?: "Gagal membaca perangkat terpasang.")
                }
            }
        }
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    fun scan(call: PluginCall) {
        ensurePermission(call) {
            executor.execute {
                try {
                    val timeoutMs = call.getInt("timeoutMs") ?: 8_000
                    val adapter = adapter()
                        ?: throw IllegalStateException("Bluetooth tidak tersedia di perangkat ini.")
                    if (!adapter.isEnabled) {
                        throw IllegalStateException("Bluetooth HP belum diaktifkan.")
                    }

                    val found = LinkedHashMap<String, JSObject>()
                    adapter.bondedDevices?.forEach { d ->
                        found[d.address] = deviceToJson(d, bonded = true)
                    }

                    val latch = CountDownLatch(1)
                    val scanner = adapter.bluetoothLeScanner
                    val callback = object : ScanCallback() {
                        override fun onScanResult(callbackType: Int, result: ScanResult) {
                            val d = result.device ?: return
                            if (!found.containsKey(d.address)) {
                                val obj = deviceToJson(d, bonded = false)
                                obj.put("transportHint", "ble")
                                found[d.address] = obj
                            }
                        }

                        override fun onScanFailed(errorCode: Int) {
                            latch.countDown()
                        }
                    }

                    scanner?.startScan(callback)
                    latch.await(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
                    try {
                        scanner?.stopScan(callback)
                    } catch (_: Exception) {
                    }

                    val arr = JSArray()
                    found.values.forEach { arr.put(it) }
                    val ret = JSObject()
                    ret.put("devices", arr)
                    call.resolve(ret)
                } catch (e: Exception) {
                    call.reject(e.message ?: "Gagal memindai printer.")
                }
            }
        }
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    fun pairAndConnect(call: PluginCall) {
        ensurePermission(call) {
            executor.execute {
                try {
                    val address = call.getString("address")?.trim().orEmpty()
                    if (address.isEmpty()) {
                        call.reject("Alamat printer wajib diisi.")
                        return@execute
                    }
                    val nameOpt = call.getString("name")?.trim()
                    val transport = call.getString("transport") ?: "auto"
                    val result = connectInternal(address, nameOpt, transport, probe = true)
                    val ret = JSObject()
                    ret.put("address", result.address)
                    ret.put("name", result.name)
                    ret.put("transport", result.transport)
                    call.resolve(ret)
                } catch (e: Exception) {
                    call.reject(e.message ?: "Gagal menghubungkan printer.")
                }
            }
        }
    }

    @PluginMethod
    fun print(call: PluginCall) {
        ensurePermission(call) {
            executor.execute {
                try {
                    val b64 = call.getString("dataBase64")
                        ?: throw IllegalArgumentException("dataBase64 wajib diisi.")
                    val data = Base64.decode(b64, Base64.DEFAULT)
                    val saved = loadSaved()
                        ?: throw IllegalStateException("NEVER_PAIRED")

                    ensureConnected(saved.address, saved.name, saved.transport)
                    writeWithRecovery(data)

                    val ret = JSObject()
                    ret.put("deviceName", activeName ?: saved.name)
                    ret.put("transport", activeTransport ?: saved.transport)
                    call.resolve(ret)
                } catch (e: Exception) {
                    val msg = e.message ?: "Gagal mencetak."
                    if (msg == "NEVER_PAIRED") {
                        call.reject("Printer belum dihubungkan. Tap tombol Printer sekali untuk memilih printer.", "NEVER_PAIRED")
                    } else {
                        call.reject(msg)
                    }
                }
            }
        }
    }

    @PluginMethod
    fun getSavedPrinter(call: PluginCall) {
        val saved = loadSaved()
        val ret = JSObject()
        if (saved == null) {
            ret.put("printer", JSObject.NULL)
        } else {
            val p = JSObject()
            p.put("address", saved.address)
            p.put("name", saved.name)
            p.put("transport", saved.transport)
            ret.put("printer", p)
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun clearSavedPrinter(call: PluginCall) {
        clearActiveLink()
        prefs().edit().clear().apply()
        activeAddress = null
        activeName = null
        activeTransport = null
        call.resolve()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val saved = loadSaved()
        val ret = JSObject()
        if (saved == null) {
            ret.put("status", "never_paired")
            call.resolve(ret)
            return
        }
        ret.put("address", saved.address)
        ret.put("name", saved.name)
        ret.put("transport", saved.transport)
        val connected = when (activeTransport) {
            "spp" -> sppSocket?.isConnected == true
            "ble" -> gatt != null && writeChar != null
            else -> false
        }
        ret.put("status", if (connected) "connected" else "disconnected")
        call.resolve(ret)
    }

    private data class Saved(
        val address: String,
        val name: String,
        val transport: String
    )

    private fun loadSaved(): Saved? {
        val address = prefs().getString(KEY_ADDRESS, null)?.trim().orEmpty()
        if (address.isEmpty()) return null
        val name = prefs().getString(KEY_NAME, null)?.trim().orEmpty().ifEmpty { "Printer thermal" }
        val transport = prefs().getString(KEY_TRANSPORT, "auto") ?: "auto"
        return Saved(address, name, transport)
    }

    private data class ConnectResult(
        val address: String,
        val name: String,
        val transport: String
    )

    @SuppressLint("MissingPermission")
    private fun connectInternal(
        address: String,
        nameOpt: String?,
        transport: String,
        probe: Boolean
    ): ConnectResult {
        val adapter = adapter()
            ?: throw IllegalStateException("Bluetooth tidak tersedia di perangkat ini.")
        if (!adapter.isEnabled) {
            throw IllegalStateException("Bluetooth HP belum diaktifkan.")
        }
        val device = try {
            adapter.getRemoteDevice(address)
        } catch (e: IllegalArgumentException) {
            throw IllegalArgumentException("Alamat Bluetooth tidak valid: $address")
        }
        @SuppressLint("MissingPermission")
        val name = nameOpt?.takeIf { it.isNotBlank() }
            ?: try {
                device.name?.trim().orEmpty()
            } catch (_: SecurityException) {
                ""
            }.ifEmpty { "Printer thermal" }

        clearActiveLink()

        val order = when (transport) {
            "spp" -> listOf("spp")
            "ble" -> listOf("ble")
            else -> listOf("spp", "ble")
        }

        var last: Exception? = null
        for (mode in order) {
            try {
                when (mode) {
                    "spp" -> connectSpp(device)
                    "ble" -> connectBle(device)
                }
                if (probe) {
                    writeBytes(byteArrayOf(0x1b, 0x40))
                }
                savePrinter(address, name, mode)
                emitConnection(true)
                return ConnectResult(address, name, mode)
            } catch (e: Exception) {
                last = e
                clearActiveLink()
            }
        }
        throw IllegalStateException(
            "Gagal terhubung ke $name. Pastikan printer menyala, dekat dengan HP, " +
                "dan tidak sedang tersambung ke aplikasi lain. (${last?.message ?: "unknown"})"
        )
    }

    private fun ensureConnected(address: String, name: String, preferredTransport: String) {
        val connected = when (activeTransport) {
            "spp" -> sppSocket?.isConnected == true && activeAddress == address
            "ble" -> gatt != null && writeChar != null && activeAddress == address
            else -> false
        }
        if (connected) return
        val transport = if (preferredTransport == "spp" || preferredTransport == "ble") {
            preferredTransport
        } else {
            "auto"
        }
        connectInternal(address, name, transport, probe = false)
    }

    @SuppressLint("MissingPermission")
    private fun connectSpp(device: BluetoothDevice) {
        var last: Exception? = null
        for (attempt in 1..3) {
            try {
                val socket = try {
                    device.createRfcommSocketToServiceRecord(SPP_UUID)
                } catch (e: Exception) {
                    // Fallback reflection for some cheap printers
                    val m = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
                    m.invoke(device, 1) as BluetoothSocket
                }
                adapter()?.cancelDiscovery()
                socket.connect()
                sppSocket = socket
                sppOut = socket.outputStream
                activeTransport = "spp"
                activeAddress = device.address
                return
            } catch (e: Exception) {
                last = e
                try {
                    Thread.sleep(400L * attempt)
                } catch (_: InterruptedException) {
                }
            }
        }
        throw IOException(last?.message ?: "SPP connect gagal")
    }

    @SuppressLint("MissingPermission")
    private fun connectBle(device: BluetoothDevice) {
        val latch = CountDownLatch(1)
        val error = AtomicReference<Exception?>(null)
        val foundChar = AtomicReference<BluetoothGattCharacteristic?>(null)
        val gattRef = AtomicReference<BluetoothGatt?>(null)

        val callback = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    g.discoverServices()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    if (foundChar.get() == null) {
                        error.set(IOException("BLE terputus (status=$status)"))
                        latch.countDown()
                    } else {
                        mainHandler.post {
                            if (gatt === g) {
                                clearActiveLink()
                            }
                        }
                    }
                }
            }

            override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    error.set(IOException("Gagal discover layanan BLE"))
                    latch.countDown()
                    return
                }
                val ch = findWritableCharacteristic(g)
                if (ch == null) {
                    error.set(
                        IOException(
                            "Printer tidak punya kanal tulis BLE yang dikenali."
                        )
                    )
                    latch.countDown()
                    return
                }
                foundChar.set(ch)
                gattRef.set(g)
                latch.countDown()
            }
        }

        val g = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
        val ok = latch.await(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        if (!ok) {
            try {
                g.close()
            } catch (_: Exception) {
            }
            throw IOException("Printer tidak merespons (batas waktu BLE habis).")
        }
        error.get()?.let {
            try {
                g.close()
            } catch (_: Exception) {
            }
            throw it
        }
        gatt = gattRef.get() ?: g
        writeChar = foundChar.get()
        activeTransport = "ble"
        activeAddress = device.address
    }

    private fun findWritableCharacteristic(g: BluetoothGatt): BluetoothGattCharacteristic? {
        for (serviceUuid in BLE_SERVICES) {
            val service = g.getService(serviceUuid) ?: continue
            for (charUuid in BLE_WRITE_CHARS) {
                val ch = service.getCharacteristic(charUuid) ?: continue
                val props = ch.properties
                if (props and BluetoothGattCharacteristic.PROPERTY_WRITE != 0 ||
                    props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0
                ) {
                    return ch
                }
            }
        }
        for (service in g.services) {
            for (ch in service.characteristics) {
                val props = ch.properties
                if (props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0) return ch
                if (props and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) return ch
            }
        }
        return null
    }

    private fun prefersSmallChunk(): Boolean {
        val addr = activeAddress ?: return false
        return prefs().getBoolean("$KEY_SMALL_CHUNK:$addr", false)
    }

    private fun rememberSmallChunk() {
        val addr = activeAddress ?: return
        prefs().edit().putBoolean("$KEY_SMALL_CHUNK:$addr", true).apply()
    }

    private class ChunkWriteException(val offset: Int, cause: Throwable) : IOException(cause.message, cause)

    private fun writeWithRecovery(data: ByteArray) {
        var offset = 0
        var chunkSize = if (prefersSmallChunk()) SMALL_CHUNK_SIZE else CHUNK_SIZE
        var recoveries = 0
        while (true) {
            try {
                writeBytes(data, offset, chunkSize)
                return
            } catch (e: Exception) {
                if (recoveries >= WRITE_RECOVERY_ATTEMPTS) {
                    throw if (e is ChunkWriteException) (e.cause ?: e) else e
                }
                recoveries += 1
                if (e is ChunkWriteException) offset = e.offset
                if (chunkSize > SMALL_CHUNK_SIZE) {
                    chunkSize = SMALL_CHUNK_SIZE
                    rememberSmallChunk()
                }
                val saved = loadSaved() ?: throw e
                clearActiveLink()
                Thread.sleep(400)
                ensureConnected(saved.address, saved.name, saved.transport)
            }
        }
    }

    private fun writeBytes(data: ByteArray, start: Int = 0, chunkSize: Int = CHUNK_SIZE) {
        when (activeTransport) {
            "spp" -> {
                val out = sppOut ?: throw IOException("Socket SPP tidak siap.")
                var i = start
                while (i < data.size) {
                    try {
                        val end = minOf(i + chunkSize, data.size)
                        out.write(data, i, end - i)
                        out.flush()
                        i = end
                    } catch (e: Exception) {
                        throw ChunkWriteException(i, e)
                    }
                    if (i < data.size) Thread.sleep(CHUNK_DELAY_MS)
                }
            }
            "ble" -> {
                val g = gatt ?: throw IOException("GATT tidak siap.")
                val ch = writeChar ?: throw IOException("Karakteristik tulis BLE tidak siap.")
                var i = start
                while (i < data.size) {
                    try {
                        val end = minOf(i + chunkSize, data.size)
                        val slice = data.copyOfRange(i, end)
                        ch.value = slice
                        val writeType =
                            if (ch.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0) {
                                BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                            } else {
                                BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                            }
                        ch.writeType = writeType
                        val ok = g.writeCharacteristic(ch)
                        if (!ok) throw IOException("Gagal menulis ke printer BLE di offset $i")
                        i = end
                    } catch (e: Exception) {
                        throw ChunkWriteException(i, e)
                    }
                    if (i < data.size) Thread.sleep(CHUNK_DELAY_MS)
                }
            }
            else -> throw IOException("Belum terhubung ke printer.")
        }
    }

    override fun handleOnDestroy() {
        clearActiveLink()
        executor.shutdownNow()
        super.handleOnDestroy()
    }
}
