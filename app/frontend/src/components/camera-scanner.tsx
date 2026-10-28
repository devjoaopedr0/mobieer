import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Leitor de código de barras pela câmera do celular/tablet (o mesmo motor do
 * estoque). Fica aberto lendo uma etiqueta atrás da outra; o mesmo código lido
 * de novo em poucos segundos é ignorado, para não dar baixa duas vezes.
 *
 * Com onPhoto (e sem onCode) vira câmera de foto: "Tirar foto" grava o quadro
 * atual como JPEG (ex.: foto da etiqueta da peça para a leitura por IA).
 */
export function CameraScanner({ onCode, onPhoto, disabled, repeatMs = 3000 }: { onCode?: (code: string) => void; onPhoto?: (file: File) => void; disabled?: boolean; repeatMs?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const last = useRef<{ code: string; at: number } | null>(null);
  const handler = useRef(onCode);
  handler.current = onCode;
  const photoMode = Boolean(onPhoto) && !onCode;
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    controls.current?.stop();
    controls.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador não permite abrir a câmera. Verifique se o site está em HTTPS ou use o leitor/teclado.");
      return;
    }
    setStarting(true);
    try {
      const video = videoRef.current;
      if (!video) return;
      if (photoMode) {
        // só a imagem: sem procurar código de barras
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        setActive(true);
        return;
      }
      const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 150 });
      controls.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        video,
        (result) => {
          const code = result?.getText().trim();
          if (!code) return;
          const now = Date.now();
          if (last.current && last.current.code === code && now - last.current.at < repeatMs) return;
          last.current = { code, at: now };
          handler.current?.(code);
        },
      );
      setActive(true);
    } catch (e) {
      stop();
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Permissão da câmera negada. Autorize o acesso nas configurações do navegador e tente novamente."
          : name === "NotFoundError" || name === "DevicesNotFoundError"
            ? "Nenhuma câmera foi encontrada neste dispositivo."
            : name === "NotReadableError" || name === "TrackStartError"
              ? "A câmera está sendo usada por outro aplicativo. Feche-o e tente novamente."
              : "Não foi possível abrir a câmera. Verifique a permissão, use HTTPS e tente novamente.",
      );
    } finally {
      setStarting(false);
    }
  };

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return setError("Não foi possível tirar a foto. Tente de novo.");
        stop();
        onPhoto?.(new File([blob], `etiqueta-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  };

  return (
    <div className="space-y-2">
      <div className={active ? "relative overflow-hidden rounded-xl bg-black" : "hidden"}>
        <video ref={videoRef} muted playsInline className="aspect-[4/3] max-h-[50vh] w-full object-cover" />
        <div className={photoMode ? "pointer-events-none absolute inset-[8%] rounded-lg border-2 border-white/90" : "pointer-events-none absolute inset-x-[10%] top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]"} />
        <p className="absolute inset-x-0 bottom-3 text-center text-xs font-medium text-white drop-shadow">{photoMode ? "Enquadre a etiqueta inteira, com boa luz" : "Centralize o código de barras da etiqueta na moldura"}</p>
      </div>
      {active ? (
        <div className="flex gap-2">
          {photoMode && (
            <Button type="button" className="flex-1" onClick={takePhoto}>
              <Camera className="mr-2 h-4 w-4" /> Tirar foto
            </Button>
          )}
          <Button type="button" variant="outline" className="flex-1" onClick={stop}>
            <CameraOff className="mr-2 h-4 w-4" /> Fechar câmera
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="w-full" disabled={disabled || starting} onClick={() => void start()}>
          {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />} {photoMode ? "Abrir câmera" : "Ler pela câmera"}
        </Button>
      )}
      {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
