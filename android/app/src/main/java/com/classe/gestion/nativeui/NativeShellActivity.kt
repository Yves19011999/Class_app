package com.classe.gestion.nativeui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.PermanentDrawerSheet
import androidx.compose.material3.PermanentNavigationDrawer
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.DrawerValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

class NativeShellActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { NativeClassApp() }
    }
}

private data class NativeDestination(val label: String, val group: String)
private val destinations = listOf(
    NativeDestination("Tableau de bord", "PRINCIPAL"),
    NativeDestination("Classes", "PRINCIPAL"),
    NativeDestination("Élèves", "PRINCIPAL"),
    NativeDestination("Planning", "PRINCIPAL"),
    NativeDestination("Présences", "ÉVALUATIONS"),
    NativeDestination("Devoirs", "ÉVALUATIONS"),
    NativeDestination("Notes et moyennes", "ÉVALUATIONS"),
    NativeDestination("Audit IA local", "ANALYSE"),
    NativeDestination("Rapports", "ANALYSE"),
    NativeDestination("Import / Export", "SYSTÈME"),
    NativeDestination("Paramètres", "SYSTÈME")
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativeClassApp() {
    var selected by remember { mutableStateOf("Tableau de bord") }
    val context = LocalContext.current
    val nativeDatabase = remember { NativeDatabase(context).also { it.importPendingSnapshot() } }
    val snapshot = remember { NativeRepository(nativeDatabase).snapshot() }
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val content: @Composable (Boolean) -> Unit = { compact ->
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(selected, fontWeight = FontWeight.Bold) },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
                    navigationIcon = if (compact) ({
                        Button(onClick = { scope.launch { drawerState.open() } }) { Text("Menu") }
                    }) else ({})
                )
            },
            containerColor = Color(0xFFF4F8FF)
        ) { padding ->
            NativeContent(selected, snapshot, Modifier.padding(padding))
        }
    }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val compact = maxWidth < 760.dp
        if (compact) {
            ModalNavigationDrawer(
                drawerState = drawerState,
                drawerContent = { DrawerContent(selected) { selected = it; scope.launch { drawerState.close() } } }
            ) { content(true) }
        } else {
            PermanentNavigationDrawer(drawerContent = { DrawerContent(selected) { selected = it } }) { content(false) }
        }
    }
}

@Composable
private fun DrawerContent(selected: String, onSelect: (String) -> Unit) {
    PermanentDrawerSheet(
        modifier = Modifier.width(286.dp),
        drawerContainerColor = Color(0xFF081B4B)
    ) {
        Column(Modifier.fillMaxHeight().padding(horizontal = 14.dp, vertical = 22.dp)) {
            Text("Classe", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black)
            Text("UltraReview · version native", color = Color(0xFFA9C8F6), fontSize = 12.sp)
            Spacer(Modifier.height(18.dp))
            Card(colors = CardDefaults.cardColors(containerColor = Color(0x264A8CDB)), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp)) {
                    Text("Yves Marius", color = Color.White, fontWeight = FontWeight.Bold)
                    Text("Administrateur · hors ligne", color = Color(0xFFB8D9FF), fontSize = 12.sp)
                }
            }
            Spacer(Modifier.height(18.dp))
            var lastGroup = ""
            destinations.forEach { destination ->
                if (destination.group != lastGroup) {
                    lastGroup = destination.group
                    Text(destination.group, color = Color(0xFF7EB4F2), fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 12.dp, top = 12.dp, bottom = 4.dp))
                }
                NavigationDrawerItem(
                    label = { Text(destination.label, color = Color.White, fontSize = 14.sp) },
                    selected = selected == destination.label,
                    onClick = { onSelect(destination.label) },
                    shape = RoundedCornerShape(12.dp)
                )
            }
            Spacer(Modifier.weight(1f))
            Text("Version Pro · sécurisée", color = Color(0xFFFFD86B), fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.padding(12.dp))
        }
    }
}

@Composable
private fun NativeContent(selected: String, snapshot: NativeSnapshot, modifier: Modifier = Modifier) {
    AnimatedContent(targetState = selected, label = "native-navigation", modifier = modifier.fillMaxSize()) { destination ->
        if (destination == "Tableau de bord") DashboardNative(snapshot)
        else if (destination == "Audit IA local") AuditNative(snapshot)
        else PlaceholderNative(destination)
    }
}

@Composable
private fun DashboardNative(snapshot: NativeSnapshot) {
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = Color.Transparent), modifier = Modifier.fillMaxWidth()) {
                Box(Modifier.background(Brush.linearGradient(listOf(Color(0xFF123AA0), Color(0xFF10A6D8)))).padding(24.dp)) {
                    Column { Text("Bonjour, Yves Marius", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black); Text("Enseigner · Suivre · Réussir ensemble", color = Color(0xFFD7F4FF), fontSize = 15.sp) }
                }
            }
        }
        item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) { NativeStat("Classes", snapshot.classes.toString(), Color(0xFF1266DA), Modifier.weight(1f)); NativeStat("Élèves", snapshot.students.toString(), Color(0xFF0BAA67), Modifier.weight(1f)); NativeStat("Notes", snapshot.grades.toString(), Color(0xFF7C32D8), Modifier.weight(1f)) } }
        item { Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.White)) { Column(Modifier.padding(18.dp)) { Text("Vue d’ensemble", fontWeight = FontWeight.Bold, fontSize = 18.sp); Spacer(Modifier.height(10.dp)); Text("La base native Compose est prête pour la migration Room et l’import sécurisé des données.", color = Color(0xFF53677F)); Divider(Modifier.padding(vertical = 14.dp)); Text("Audit local, notes pondérées et navigation adaptative seront raccordés ici.", color = Color(0xFF53677F)) } } }
    }
}

@Composable
private fun NativeStat(label: String, value: String, color: Color, modifier: Modifier) {
    val progress by animateFloatAsState(if (value == "—") .72f else .9f, label = label)
    Card(modifier, colors = CardDefaults.cardColors(containerColor = color), shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(16.dp)) { Text(value, color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black); Text(label, color = Color.White, fontWeight = FontWeight.Bold); Spacer(Modifier.height(8.dp)); Box(Modifier.fillMaxWidth(progress).height(4.dp).background(Color.White.copy(alpha = .65f), RoundedCornerShape(4.dp))) } }
}

@Composable
private fun AuditNative(snapshot: NativeSnapshot) {
    Column(Modifier.fillMaxSize().padding(24.dp)) { Text("Audit IA local", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black); Spacer(Modifier.height(8.dp)); Text("Analyse hors ligne compatible Android ancien et récent.", color = Color(0xFF53677F)); Spacer(Modifier.height(20.dp)); Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFE3F7EC))) { Column(Modifier.padding(18.dp)) { Text("Données natives", fontWeight = FontWeight.Bold); Text("${snapshot.classes} classes · ${snapshot.students} élèves", fontSize = 21.sp, fontWeight = FontWeight.Black, color = Color(0xFF087F4E)); Text("${snapshot.subjects} matières · ${snapshot.grades} notes · ${snapshot.assignments} devoirs", color = Color(0xFF35634F)) } }; Spacer(Modifier.height(18.dp)); Button(onClick = {}) { Text("Lancer l’audit local") } }
}

@Composable
private fun PlaceholderNative(destination: String) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { Text(destination, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black); Text("Écran natif en cours de raccordement aux données Room.", color = Color(0xFF53677F)); Card(colors = CardDefaults.cardColors(containerColor = Color.White)) { Text("Cette étape conserve l’ancienne interface et ses données pendant la migration sécurisée.", Modifier.padding(18.dp)) } }
}
