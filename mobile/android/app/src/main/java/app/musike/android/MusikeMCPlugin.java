package app.musike.android;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.os.Handler;
import android.os.Looper;
import java.util.Locale;
import java.util.Set;
import android.speech.tts.Voice;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Native, local Swedish TTS. Unlike Web Speech, Android WebView need not expose voices. */
@CapacitorPlugin(name = "MusikeMC")
public class MusikeMCPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    private boolean initialized = false;
    private boolean available = false;
    private String reason = "Röstmotorn startar";
    private PluginCall pending;
    private long serial = 0;

    @Override public void load() {
        main.post(() -> {
            tts = new TextToSpeech(getContext().getApplicationContext(), status -> main.post(() -> {
                initialized = true;
                if (status != TextToSpeech.SUCCESS || tts == null) {
                    available = false;
                    reason = "Androids talsyntes kunde inte starta";
                    return;
                }
                int result = tts.setLanguage(new Locale("sv", "SE"));
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    available = false;
                    reason = "Installera en svensk röst i Androids talsyntesinställningar";
                    return;
                }
                // Prevent unexpected online speech: select a voice that does not require network.
                Set<Voice> voices = tts.getVoices();
                Voice best = null;
                if (voices != null) for (Voice v : voices) {
                    if ("sv".equalsIgnoreCase(v.getLocale().getLanguage()) && !v.isNetworkConnectionRequired()) {
                        if (best == null || v.getQuality() > best.getQuality()) best = v;
                    }
                }
                if (best == null || tts.setVoice(best) != TextToSpeech.SUCCESS) {
                    available = false;
                    reason = "Ingen svensk offline-röst är installerad";
                    return;
                }
                available = true;
                reason = "Svensk lokal röst: " + best.getName();
                tts.setSpeechRate(1.0f);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) {
                        main.post(() -> {
                            JSObject event = new JSObject(); event.put("state", "start"); event.put("id", id);
                            notifyListeners("speech", event);
                        });
                    }
                    @Override public void onDone(String id) { finish(id, null); }
                    @Override public void onError(String id) { finish(id, "Android TTS kunde inte läsa upp texten"); }
                    @Override public void onError(String id, int code) { finish(id, "TTS felkod " + code); }
                    @Override public void onStop(String id, boolean interrupted) { finish(id, "avbruten"); }
                });
            }));
        });
    }

    private void finish(String id, String error) {
        main.post(() -> {
            if (pending == null || !id.equals(String.valueOf(serial))) return;
            PluginCall done = pending; pending = null;
            JSObject event = new JSObject();
            event.put("state", error == null ? "end" : "error");
            event.put("id", id);
            if (error != null) event.put("message", error);
            notifyListeners("speech", event);
            if (error == null || "avbruten".equals(error)) done.resolve();
            else done.reject(error);
        });
    }

    @PluginMethod public void status(PluginCall call) {
        main.post(() -> {
            JSObject response = new JSObject();
            response.put("available", available);
            response.put("ready", initialized);
            response.put("message", reason);
            call.resolve(response);
        });
    }

    @PluginMethod public void speak(PluginCall call) {
        main.post(() -> {
            if (!available || tts == null) { call.reject(reason); return; }
            String text = call.getString("text", "").trim();
            if (text.isEmpty()) { call.reject("Tom text"); return; }
            if (pending != null) { pending.resolve(); pending = null; }
            tts.stop();
            serial++;
            pending = call;
            int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, String.valueOf(serial));
            if (result == TextToSpeech.ERROR) {
                pending = null;
                call.reject("Android TTS kunde inte starta");
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
        if (tts != null) { tts.stop(); tts.shutdown(); tts = null; }
        super.handleOnDestroy();
    }
}
