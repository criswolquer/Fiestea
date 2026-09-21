package es.fiestea.app.data

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.io.IOException

data class Session(
    val accessToken: String,
    val refreshToken: String,
    /** Segundos desde 1970 en que caduca el accessToken. */
    val expiresAt: Long,
    val userId: String,
    val email: String,
    val displayName: String,
)

class AuthException(message: String) : Exception(message)

sealed interface SignUpResult {
    data object LoggedIn : SignUpResult
    /** Supabase tiene activada la confirmación por email: hay que pulsar el enlace del correo. */
    data object NeedsEmailConfirmation : SignUpResult
}

/**
 * Cuentas de usuario con Supabase Auth (email + contraseña), usando su API REST.
 * La sesión se guarda en el móvil y el token se renueva solo cuando caduca.
 */
class AuthManager(context: Context, baseUrl: String, private val anonKey: String) {

    private val auth = baseUrl.trimEnd('/') + "/auth/v1"
    private val prefs = context.getSharedPreferences("fiestea_auth", Context.MODE_PRIVATE)
    private val _session = MutableStateFlow(load())
    val session: StateFlow<Session?> = _session.asStateFlow()
    private val refreshLock = Mutex()
    private val io = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val headers get() = mapOf("apikey" to anonKey)

    suspend fun signUp(name: String, email: String, password: String): SignUpResult {
        val body = JSONObject()
            .put("email", email.trim())
            .put("password", password)
            .put("data", JSONObject().put("display_name", name.trim()))
        val res = call("/signup", body)
        return if (res.has("access_token")) {
            save(parseSession(res)); SignUpResult.LoggedIn
        } else {
            SignUpResult.NeedsEmailConfirmation
        }
    }

    suspend fun signIn(email: String, password: String) {
        val body = JSONObject().put("email", email.trim()).put("password", password)
        save(parseSession(call("/token?grant_type=password", body)))
    }

    fun signOut() {
        val s = _session.value
        save(null)
        // Invalida también el token en el servidor (si falla, da igual: ya no lo guardamos)
        if (s != null) {
            io.launch {
                runCatching {
                    httpRequest("POST", "$auth/logout", headers + ("Authorization" to "Bearer ${s.accessToken}"))
                }
            }
        }
    }

    /** Token válido para llamar a la API, renovándolo si hace falta. null si no hay sesión. */
    suspend fun validAccessToken(): String? =
        refreshLock.withLock { renewIfNeeded() }

    private suspend fun renewIfNeeded(): String? {
        val s = _session.value ?: return null
        val now = System.currentTimeMillis() / 1000
        if (s.expiresAt - 60 > now) return s.accessToken
        return try {
            val res = call("/token?grant_type=refresh_token", JSONObject().put("refresh_token", s.refreshToken))
            val fresh = parseSession(res)
            save(fresh)
            fresh.accessToken
        } catch (e: AuthException) {
            save(null) // la sesión ya no vale: hay que volver a entrar
            null
        } catch (e: IOException) {
            s.accessToken // sin conexión: lo intentamos con el que hay
        }
    }

    private suspend fun call(path: String, body: JSONObject): JSONObject {
        try {
            return JSONObject(httpRequest("POST", auth + path, headers, body.toString()))
        } catch (e: HttpException) {
            if (e.code in 400..499) throw AuthException(translate(e.serverMessage))
            throw e
        }
    }

    private fun parseSession(o: JSONObject): Session {
        val user = o.getJSONObject("user")
        val meta = user.optJSONObject("user_metadata")
        val email = user.optString("email")
        return Session(
            accessToken = o.getString("access_token"),
            refreshToken = o.getString("refresh_token"),
            expiresAt = if (o.has("expires_at")) o.getLong("expires_at")
            else System.currentTimeMillis() / 1000 + o.optLong("expires_in", 3600),
            userId = user.getString("id"),
            email = email,
            displayName = meta?.optString("display_name")?.takeIf { it.isNotBlank() }
                ?: email.substringBefore('@'),
        )
    }

    private fun translate(msg: String): String {
        val m = msg.lowercase()
        return when {
            "invalid login" in m -> "Email o contraseña incorrectos."
            "already registered" in m || "already been registered" in m -> "Ya existe una cuenta con ese email."
            "not confirmed" in m -> "Confirma tu email con el enlace que te hemos enviado."
            "password" in m && ("6" in m || "short" in m || "weak" in m) -> "La contraseña debe tener al menos 6 caracteres."
            "email" in m && "invalid" in m -> "Ese email no parece válido."
            "rate limit" in m || "too many" in m -> "Demasiados intentos. Espera un momento."
            "refresh token" in m -> "Tu sesión ha caducado. Vuelve a entrar."
            else -> msg
        }
    }

    private fun load(): Session? {
        val token = prefs.getString("access", null) ?: return null
        return Session(
            accessToken = token,
            refreshToken = prefs.getString("refresh", "") ?: "",
            expiresAt = prefs.getLong("expires", 0),
            userId = prefs.getString("uid", "") ?: "",
            email = prefs.getString("email", "") ?: "",
            displayName = prefs.getString("name", "") ?: "",
        )
    }

    private fun save(s: Session?) {
        _session.value = s
        prefs.edit().apply {
            if (s == null) clear() else {
                putString("access", s.accessToken)
                putString("refresh", s.refreshToken)
                putLong("expires", s.expiresAt)
                putString("uid", s.userId)
                putString("email", s.email)
                putString("name", s.displayName)
            }
        }.apply()
    }
}

