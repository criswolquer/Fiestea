package es.fiestea.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Error devuelto por el servidor (código HTTP + mensaje legible). */
class HttpException(val code: Int, val body: String) : IOException("HTTP $code: $body") {
    /** Intenta sacar el mensaje de error de las respuestas JSON de Supabase. */
    val serverMessage: String
        get() = runCatching {
            val o = JSONObject(body)
            listOf("msg", "error_description", "message", "error")
                .firstNotNullOfOrNull { k -> o.optString(k).takeIf { it.isNotBlank() && it != "null" } }
        }.getOrNull() ?: body
}

/** Petición HTTP sencilla, fuera del hilo principal. */
suspend fun httpRequest(
    method: String,
    url: String,
    headers: Map<String, String>,
    body: String? = null,
): String = withContext(Dispatchers.IO) {
    val conn = URL(url).openConnection() as HttpURLConnection
    try {
        conn.requestMethod = method
        conn.connectTimeout = 15_000
        conn.readTimeout = 20_000
        conn.setRequestProperty("Accept", "application/json")
        headers.forEach { (k, v) -> conn.setRequestProperty(k, v) }
        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
        if (code !in 200..299) throw HttpException(code, text)
        text
    } finally {
        conn.disconnect()
    }
}
