package app.musike.android;

import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Offline Android voice output, independent from WebView speechSynthesis. */
@CapacitorPlugin(name = "MusikeMC")
public class MusikeMCPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    private boolean initialized;
    private String bootMessage = "Voice engine is starting";
    private PluginCall pending;
    private long serial;

    @Override public void load() {
        main.post(() -> {
            tts = new TextToSpeech(getContext().getApplicationContext(), status -> main.post(() -> {
                initialized = true;
                if (status != TextToSpeech.SUCCESS || tts == null) {
                    bootMessage = "Android text-to-speech could not start";
                    return;
                }
                tts.setSpeechRate(0.96f);
                bootMessage = "Ready";
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) {
                        main.post(() -> {
                            JSObject event = new JSObject();
                            event.put("state", "start");
                            event.put("id", id);
                            notifyListeners("speech", event);
                        });
                    }
                    @Override public void onDone(String id) { finish(id, null); }
                    @Override public void onError(String id) { finish(id, "Speech output failed"); }
                    @Override public void onError(String id, int code) { finish(id, "Speech error " + code); }
                    @Override public void onStop(String id, boolean interrupted) { finish(id, "cancelled"); }
                });
            }));
        });
    }

    private List<Voice> localVoices(String language) {
        List<Voice> out = new ArrayList<>();
        if (!initialized || tts == null) return out;
        Set<Voice> raw = tts.getVoices();
        if (raw == null) return out;
        String prefix = language == null ? "en" : Locale.forLanguageTag(language).getLanguage();
        for (Voice v : raw) {
            if (v.getLocale() != null && prefix.equalsIgnoreCase(v.getLocale().getLanguage())
                    && !v.isNetworkConnectionRequired()) out.add(v);
        }
        out.sort(Comparator.comparingInt(Voice::getQuality).reversed()
                .thenComparing(v -> v.getName()));
        return out;
    }

    @PluginMethod public void status(PluginCall call) {
        main.post(() -> {
            String language = call.getString("language", "en-US");
            List<Voice> voices = localVoices(language);
            JSArray choices = new JSArray();
            for (Voice v : voices) {
                JSObject row = new JSObject();
                row.put("id", v.getName());
                row.put("name", v.getName());
                row.put("lang", v.getLocale().toLanguageTag());
                choices.put(row);
            }
            JSObject response = new JSObject();
            response.put("ready", initialized);
            response.put("available", !voices.isEmpty());
            response.put("voices", choices);
            response.put("message", !initialized ? bootMessage : voices.isEmpty()
                    ? "No offline " + language + " voice found in Android settings"
                    : voices.size() + " offline " + language + " voices available");
            call.resolve(response);
        });
    }

    private void finish(String id, String error) {
        main.post(() -> {
            if (pending == null || !id.equals(Long.toString(serial))) return;
            PluginCall completed = pending;
            pending = null;
            JSObject event = new JSObject();
            event.put("state", error == null ? "end" : "error");
            event.put("id", id);
            if (error != null) event.put("message", error);
            notifyListeners("speech", event);
            if (error == null || "cancelled".equals(error)) completed.resolve();
            else completed.reject(error);
        });
    }

    @PluginMethod public void speak(PluginCall call) {
        main.post(() -> {
            if (!initialized || tts == null) { call.reject(bootMessage); return; }
            String text = call.getString("text", "").trim();
            if (text.isEmpty()) { call.reject("Empty speech"); return; }
            String language = call.getString("language", "en-US");
            String voiceId = call.getString("voiceId", "");
            List<Voice> voices = localVoices(language);
            if (voices.isEmpty()) { call.reject("No local voice for " + language); return; }
            Voice selected = voices.get(0);
            for (Voice candidate : voices) if (candidate.getName().equals(voiceId)) {
                selected = candidate; break;
            }
            if (tts.setVoice(selected) != TextToSpeech.SUCCESS) {
                call.reject("Could not select offline voice"); return;
            }
            Double rate = call.getDouble("rate");
            tts.setSpeechRate(rate == null ? 0.96f : Math.max(0.7f, Math.min(1.2f, rate.floatValue())));
            if (pending != null) { pending.resolve(); pending = null; }
            tts.stop();
            serial++;
            pending = call;
            if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, Long.toString(serial)) == TextToSpeech.ERROR) {
                pending = null;
                call.reject("Android text-to-speech failed to start");
            }
        });
    }

    @PluginMethod public void stop(PluginCall call) {
        main.post(() -> {
            serial++;
            if (tts != null) tts.stop();
            if (pending != null) { pending.resolve(); pending = null; }
            call.resolve();
        });
    }

    @Override protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        super.handleOnDestroy();
    }
}
