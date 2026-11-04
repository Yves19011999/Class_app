package com.classe.gestion.nativeui

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject
import java.util.UUID

/** Stockage natif minimal, sans serveur et compatible avec les anciens Android. */
class NativeDatabase(private val appContext: Context) : SQLiteOpenHelper(appContext, "classe_native.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE classes(id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE students(id TEXT PRIMARY KEY, class_id TEXT, name TEXT NOT NULL, created_at INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE subjects(id TEXT PRIMARY KEY, class_id TEXT, name TEXT NOT NULL, coefficient REAL NOT NULL DEFAULT 1)")
        db.execSQL("CREATE TABLE grades(id TEXT PRIMARY KEY, student_id TEXT, subject_id TEXT, label TEXT, value REAL, coefficient REAL NOT NULL DEFAULT 1, date TEXT)")
        db.execSQL("CREATE TABLE assignments(id TEXT PRIMARY KEY, class_id TEXT, title TEXT, due_date TEXT, done INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE TABLE attendance(id TEXT PRIMARY KEY, student_id TEXT, date TEXT, status TEXT)")
        db.execSQL("CREATE TABLE app_settings(key TEXT PRIMARY KEY, value TEXT)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) db.execSQL("ALTER TABLE students ADD COLUMN archived INTEGER NOT NULL DEFAULT 0")
    }

    fun count(table: String): Int {
        require(table in setOf("classes", "students", "subjects", "grades", "assignments", "attendance"))
        readableDatabase.rawQuery("SELECT COUNT(*) FROM $table", null).use { cursor ->
            return if (cursor.moveToFirst()) cursor.getInt(0) else 0
        }
    }

    fun saveSetting(key: String, value: String) {
        writableDatabase.insertWithOnConflict("app_settings", null, ContentValues().apply {
            put("key", key); put("value", value)
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun importPendingSnapshot() {
        val prefs = appContext.getSharedPreferences("native_migration", Context.MODE_PRIVATE)
        val payload = prefs.getString("pending_snapshot", null) ?: return
        val root = JSONObject(payload)
        val stores = root.optJSONObject("stores") ?: return
        val db = writableDatabase
        db.beginTransaction()
        try {
            val now = System.currentTimeMillis()
            val classes = stores.optJSONArray("classes")
            for (i in 0 until (classes?.length() ?: 0)) classes!!.getJSONObject(i).let { db.insertWithOnConflict("classes", null, ContentValues().apply { put("id", it.optString("id")); put("name", it.optString("name")); put("created_at", now) }, SQLiteDatabase.CONFLICT_REPLACE) }
            val students = stores.optJSONArray("students")
            for (i in 0 until (students?.length() ?: 0)) students!!.getJSONObject(i).let { db.insertWithOnConflict("students", null, ContentValues().apply { put("id", it.optString("id")); put("class_id", it.optString("classId")); put("name", it.optString("name")); put("created_at", now) }, SQLiteDatabase.CONFLICT_REPLACE) }
            val subjects = stores.optJSONArray("subjects")
            for (i in 0 until (subjects?.length() ?: 0)) subjects!!.getJSONObject(i).let { db.insertWithOnConflict("subjects", null, ContentValues().apply { put("id", it.optString("id")); put("class_id", it.optString("classId")); put("name", it.optString("name")); put("coefficient", it.optDouble("coefficient", 1.0)) }, SQLiteDatabase.CONFLICT_REPLACE) }
            val grades = stores.optJSONArray("grades")
            for (i in 0 until (grades?.length() ?: 0)) grades!!.getJSONObject(i).let { db.insertWithOnConflict("grades", null, ContentValues().apply { put("id", it.optString("id")); put("student_id", it.optString("studentId")); put("subject_id", it.optString("subjectId")); put("label", it.optString("label")); put("value", it.optDouble("value", 0.0)); put("coefficient", it.optDouble("coef", 1.0)); put("date", it.optString("date")) }, SQLiteDatabase.CONFLICT_REPLACE) }
            val homework = stores.optJSONArray("homework")
            for (i in 0 until (homework?.length() ?: 0)) homework!!.getJSONObject(i).let { db.insertWithOnConflict("assignments", null, ContentValues().apply { put("id", it.optString("id")); put("class_id", it.optString("classId")); put("title", it.optString("title")); put("due_date", it.optString("dueDate")); put("done", if (it.optBoolean("done")) 1 else 0) }, SQLiteDatabase.CONFLICT_REPLACE) }
            val attendance = stores.optJSONArray("attendance")
            for (i in 0 until (attendance?.length() ?: 0)) attendance!!.getJSONObject(i).let { db.insertWithOnConflict("attendance", null, ContentValues().apply { put("id", it.optString("id")); put("student_id", it.optString("studentId")); put("date", it.optString("date")); put("status", it.optString("status")) }, SQLiteDatabase.CONFLICT_REPLACE) }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
        prefs.edit().remove("pending_snapshot").putLong("last_import", System.currentTimeMillis()).apply()
    }
}

class NativeRepository(private val database: NativeDatabase) {
    fun snapshot(): NativeSnapshot = NativeSnapshot(
        classes = database.count("classes"),
        students = database.count("students"),
        subjects = database.count("subjects"),
        grades = database.count("grades"),
        assignments = database.count("assignments"),
        attendance = database.count("attendance")
    )

    fun classes(): List<NativeClassRow> = database.readableDatabase.rawQuery("SELECT id,name FROM classes ORDER BY name", null).use { c ->
        buildList { while (c.moveToNext()) add(NativeClassRow(c.getString(0), c.getString(1))) }
    }

    fun students(): List<NativeStudentRow> = database.readableDatabase.rawQuery("SELECT s.id,s.name,COALESCE(c.name,'Classe non définie') FROM students s LEFT JOIN classes c ON c.id=s.class_id ORDER BY s.name", null).use { c ->
        buildList { while (c.moveToNext()) add(NativeStudentRow(c.getString(0), c.getString(1), c.getString(2))) }
    }

    fun subjects(): List<NativeSubjectRow> = database.readableDatabase.rawQuery("SELECT id,name,coefficient FROM subjects ORDER BY name", null).use { c ->
        buildList { while (c.moveToNext()) add(NativeSubjectRow(c.getString(0), c.getString(1), c.getDouble(2))) }
    }

    fun grades(): List<NativeGradeRow> = database.readableDatabase.rawQuery("SELECT g.label,g.value,g.coefficient,COALESCE(s.name,'Élève'),COALESCE(sub.name,'Matière') FROM grades g LEFT JOIN students s ON s.id=g.student_id LEFT JOIN subjects sub ON sub.id=g.subject_id ORDER BY g.date DESC LIMIT 100", null).use { c ->
        buildList { while (c.moveToNext()) add(NativeGradeRow(c.getString(0), c.getDouble(1), c.getDouble(2), c.getString(3), c.getString(4))) }
    }

    fun addClass(name: String) { database.writableDatabase.insert("classes", null, ContentValues().apply { put("id", UUID.randomUUID().toString()); put("name", name); put("created_at", System.currentTimeMillis()) }) }
    fun addStudent(name: String, classId: String) { database.writableDatabase.insert("students", null, ContentValues().apply { put("id", UUID.randomUUID().toString()); put("class_id", classId); put("name", name); put("created_at", System.currentTimeMillis()) }) }
    fun addSubject(name: String, classId: String, coefficient: Double) { database.writableDatabase.insert("subjects", null, ContentValues().apply { put("id", UUID.randomUUID().toString()); put("class_id", classId); put("name", name); put("coefficient", coefficient) }) }
    fun addGrade(studentId: String, subjectId: String, label: String, value: Double, coefficient: Double, date: String) { database.writableDatabase.insert("grades", null, ContentValues().apply { put("id", UUID.randomUUID().toString()); put("student_id", studentId); put("subject_id", subjectId); put("label", label); put("value", value); put("coefficient", coefficient); put("date", date) }) }
}

data class NativeSnapshot(
    val classes: Int,
    val students: Int,
    val subjects: Int,
    val grades: Int,
    val assignments: Int,
    val attendance: Int
)

data class NativeClassRow(val id: String, val name: String)
data class NativeStudentRow(val id: String, val name: String, val className: String)
data class NativeSubjectRow(val id: String, val name: String, val coefficient: Double)
data class NativeGradeRow(val label: String, val value: Double, val coefficient: Double, val studentName: String, val subjectName: String)
