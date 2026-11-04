package com.classe.gestion;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "NativeMigration")
public class NativeMigrationPlugin extends Plugin {
    @PluginMethod
    public void saveSnapshot(PluginCall call) {
        String payload = call.getString("payload", "");
        if (payload == null || payload.length() < 2) {
            call.reject("Snapshot vide");
            return;
        }
        getContext().getSharedPreferences("native_migration", Context.MODE_PRIVATE)
                .edit().putString("pending_snapshot", payload).apply();
        JSObject result = new JSObject();
        result.put("saved", true);
        call.resolve(result);
    }
}
