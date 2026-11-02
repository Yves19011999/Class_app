package com.classe.gestion.nativeui

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/** Stockage natif minimal, sans serveur et compatible avec les anciens Android. */
class NativeDatabase(context: Context) : SQLiteOpenHelper(context, "classe_native.db", null, 1) {
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
}

data class NativeSnapshot(
    val classes: Int,
    val students: Int,
    val subjects: Int,
    val grades: Int,
    val assignments: Int,
    val attendance: Int
)
