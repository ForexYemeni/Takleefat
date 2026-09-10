/**
 * التنبيه الصوتي الفوري داخل التطبيق — الجولة السادسة عشرة
 * - نغمة لطيفة بنغمتين صاعدتين عبر Web Audio API (بلا ملفات صوتية خارجية)
 * - تفضيل صوت/كتم محفوظ لكل جهاز في localStorage
 * - فتح سياق الصوت بأول تفاعل مستخدم (سياسات التشغيل التلقائي في المتصفحات)
 * - الصوت ترفٌ لا أكثر: أي فشل يُبتلع بصمت ولا يُفشل أي مسار
 */

const SOUND_PREF_KEY = 'takleefat-alert-sound-v1'
/** حدث يُبثّ عند تغيير تفضيل الصوت — لمزامنة كل المكوّنات والتبويبات */
export const ALERT_SOUND_EVENT = 'takleefat:alert-sound-changed'

/** هل صوت التنبيه مفعّل على هذا الجهاز؟ (الافتراضي: مفعّل) */
export function isAlertSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== '0'
  } catch {
    return true
  }
}

/** تفعيل/كتم صوت التنبيه على هذا الجهاز + بث الحدث للمشتركين */
export function setAlertSoundEnabled(on: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, on ? '1' : '0')
  } catch {
    // تخزين غير متاح — يُتجاهل
  }
  try {
    window.dispatchEvent(new CustomEvent(ALERT_SOUND_EVENT))
  } catch {
    // لا شيء
  }
}

/**
 * اشتراك بتغيّرات تفضيل الصوت — يُستخدم مع useSyncExternalStore:
 * تغيير محلي + مزامنة بين تبويبات المتصفح عبر حدث storage
 */
export function subscribeAlertSound(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(ALERT_SOUND_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(ALERT_SOUND_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

let audioContext: AudioContext | null = null

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  try {
    if (!audioContext) audioContext = new AC()
    if (audioContext.state === 'suspended') void audioContext.resume()
    return audioContext
  } catch {
    return null
  }
}

/**
 * يُستدعى مرة على مستوى التطبيق عند التركيب:
 * أول نقرة/ضغطة زر تفتح سياق الصوت حتى تعمل النغمات اللاحقة فوراً
 */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return
  const handler = () => ensureContext()
  window.addEventListener('pointerdown', handler, { once: true, passive: true })
  window.addEventListener('keydown', handler, { once: true, passive: true })
}

/** نغمة التنبيه — A5 ثم D6 صاعدتان بغلاف انسيابي هادئ */
export function playAlertChime(): void {
  try {
    const ac = ensureContext()
    if (!ac || ac.state !== 'running') return

    const t0 = ac.currentTime
    const master = ac.createGain()
    master.gain.value = 0.22
    master.connect(ac.destination)

    const notes: Array<[freq: number, delay: number]> = [
      [880, 0],
      [1174.66, 0.14],
    ]
    for (const [freq, delay] of notes) {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = t0 + delay
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(1, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35)
      osc.connect(gain)
      gain.connect(master)
      osc.start(start)
      osc.stop(start + 0.4)
    }
  } catch {
    // الصوت ترف — لا يُفشل أي شيء
  }
}
