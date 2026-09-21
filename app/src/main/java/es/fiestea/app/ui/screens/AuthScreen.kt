package es.fiestea.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.fiestea.app.data.AuthException
import es.fiestea.app.data.SignUpResult
import es.fiestea.app.ui.EventsViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuthScreen(vm: EventsViewModel, onDone: () -> Unit, onBack: () -> Unit) {
    var tab by remember { mutableIntStateOf(0) } // 0 entrar · 1 crear cuenta
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val valid = email.contains('@') && password.length >= 6 && (tab == 0 || name.isNotBlank())

    fun submit() {
        busy = true; error = null; info = null
        scope.launch {
            try {
                if (tab == 0) {
                    vm.signIn(email, password)
                    onDone()
                } else {
                    when (vm.signUp(name, email, password)) {
                        SignUpResult.LoggedIn -> onDone()
                        SignUpResult.NeedsEmailConfirmation -> {
                            info = "¡Casi está! Te hemos enviado un correo a $email. Pulsa el enlace y luego entra aquí."
                            tab = 0
                        }
                    }
                }
            } catch (e: AuthException) {
                error = e.message
            } catch (e: Exception) {
                error = "No hay conexión con el servidor. Inténtalo de nuevo."
            } finally {
                busy = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("🎉", fontSize = 48.sp)
            Text(
                if (tab == 0) "Entra en Fiestea" else "Crea tu cuenta",
                style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black,
            )
            Text(
                "Con una cuenta puedes publicar fiestas, contar cómo está el ambiente y avisar de errores.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            PrimaryTabRow(selectedTabIndex = tab, containerColor = MaterialTheme.colorScheme.background) {
                Tab(selected = tab == 0, onClick = { tab = 0; error = null }, text = { Text("Entrar") })
                Tab(selected = tab == 1, onClick = { tab = 1; error = null; info = null }, text = { Text("Crear cuenta") })
            }
            if (tab == 1) {
                OutlinedTextField(
                    name, { name = it }, Modifier.fillMaxWidth(),
                    label = { Text("Tu nombre") }, singleLine = true,
                )
            }
            OutlinedTextField(
                email, { email = it.trim() }, Modifier.fillMaxWidth(),
                label = { Text("Email") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            )
            OutlinedTextField(
                password, { password = it }, Modifier.fillMaxWidth(),
                label = { Text("Contraseña (mínimo 6 caracteres)") }, singleLine = true,
                visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                trailingIcon = {
                    IconButton(onClick = { showPassword = !showPassword }) {
                        Icon(
                            if (showPassword) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                            if (showPassword) "Ocultar" else "Mostrar",
                        )
                    }
                },
            )
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            info?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
            Button(
                onClick = { submit() },
                enabled = valid && !busy,
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) {
                Text(
                    when {
                        busy -> "Un momento…"
                        tab == 0 -> "Entrar"
                        else -> "Crear cuenta"
                    },
                )
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
