import { useCallback, useEffect, useRef, useState } from 'react';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';
import { formatFileSize } from '../../lib/pdfUtils';
import {
  ocrAndParseMrz,
  parseMrzLines,
  type ParsedMrz,
  type MrzSource,
  type MrzProgress,
  MRZ_STATUS_LABELS,
} from '../../lib/mrzUtils';

type Mode = 'file' | 'camera';

type Phase = 'idle' | 'loading' | 'working' | 'done' | 'error';

interface OcrUiState {
  phase: Phase;
  progress: number;
  statusLabel: string;
  parsed: ParsedMrz | null;
  rawText: string;
  sourceLabel: string | null;
  error: string | null;
}

const IDLE: OcrUiState = {
  phase: 'idle',
  progress: 0,
  statusLabel: '',
  parsed: null,
  rawText: '',
  sourceLabel: null,
  error: null,
};

const ACCEPTED =
  'image/png,image/jpeg,image/webp,image/bmp,.png,.jpg,.jpeg,.webp,.bmp';

function statusLabelOf(status: string): string {
  return (
    MRZ_STATUS_LABELS[status] ??
    (status === 'recognizing text'
      ? 'Reconhecendo caracteres MRZ…'
      : 'Processando imagem…')
  );
}

function parsedToJson(p: ParsedMrz): string {
  const checks: Record<string, string> = {};
  for (const c of p.checks) {
    checks[c.label] =
      c.valid === null ? 'sem dígito' : c.valid ? 'ok' : 'inválido';
  }
  return JSON.stringify(
    {
      tipoDocumento: p.fields.documentTypeCode
        ? `${p.fields.documentTypeLabel} (${p.fields.documentTypeCode})`
        : null,
      formatoMrz: p.formatLabel || null,
      nomeCompleto: p.fields.fullName,
      sobrenome: p.fields.lastName,
      nomes: p.fields.givenNames,
      emissor: p.fields.issuingCountry
        ? `${p.fields.issuingCountry}${p.fields.issuingCountryName ? ` - ${p.fields.issuingCountryName}` : ''}`
        : null,
      numeroDocumento: p.fields.documentNumber,
      nacionalidade: p.fields.nationality
        ? `${p.fields.nationality}${p.fields.nationalityName ? ` - ${p.fields.nationalityName}` : ''}`
        : null,
      dataNascimento: p.fields.birthDate ?? p.fields.birthDateRaw,
      sexo: p.fields.sex ? `${p.fields.sex}${p.fields.sexLabel ? ` (${p.fields.sexLabel})` : ''}` : null,
      dataValidade: p.fields.expiryDate ?? p.fields.expiryDateRaw,
      numeroPessoal: p.fields.personalNumber,
      checksumGeral: p.allChecksValid === null ? null : p.allChecksValid ? 'ok' : 'inválido',
      checagens: checks,
    },
    null,
    2,
  );
}

export default function MrzReaderTool() {
  const [mode, setMode] = useState<Mode>('file');
  const [ui, setUi] = useState<OcrUiState>(IDLE);
  const [selected, setSelected] = useState<{
    file: File | null;
    preview: string | null;
    width: number;
    height: number;
  }>({ file: null, preview: null, width: 0, height: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualText, setManualText] = useState('');
  const [showSupport, setShowSupport] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const interactionCount = useRef(0);
  const pixPayload = generatePixCopyPaste();

  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const setBusy = useCallback((progress: number, status: string) => {
    setUi((prev) => ({
      ...prev,
      phase: progress >= 1 ? 'working' : 'loading',
      progress,
      statusLabel: status,
      error: null,
    }));
  }, []);

  const runOcr = useCallback(
    async (source: MrzSource, sourceLabel: string) => {
      setUi({
        ...IDLE,
        phase: 'loading',
        progress: 0,
        statusLabel: 'Preparando motor de OCR…',
        sourceLabel,
      });

      try {
        const { parsed, rawText } = await ocrAndParseMrz(source, (p: MrzProgress) =>
          setBusy(p.progress, statusLabelOf(p.status)),
        );
        setUi({
          phase: 'done',
          progress: 100,
          statusLabel: 'Pronto',
          parsed,
          rawText,
          sourceLabel,
          error: null,
        });
      } catch (err: any) {
        setUi({
          ...IDLE,
          phase: 'error',
          sourceLabel,
          error:
            err?.message ??
            'Falha ao processar a imagem. Verifique a conexão (o modelo de OCR é baixado na 1ª leitura).',
        });
      }

      Promise.resolve().then(() => {
        BatchLimiter.incrementUsage(1);
        interactionCount.current += 1;
        if (interactionCount.current >= 2) {
          interactionCount.current = 0;
          setShowSupport(true);
        }
      });
    },
    [setBusy],
  );

  const pickFile = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      const probe = new Image();
      probe.onload = () => {
        setSelected((prev) => {
          if (prev.preview) URL.revokeObjectURL(prev.preview);
          return {
            file,
            preview: url,
            width: probe.naturalWidth,
            height: probe.naturalHeight,
          };
        });
        void runOcr(file, file.name);
      };
      probe.onerror = () => {
        URL.revokeObjectURL(url);
        setUi({
          ...IDLE,
          phase: 'error',
          error: `Não foi possível ler a imagem "${file.name}".`,
        });
      };
      probe.src = url;
    },
    [runOcr],
  );

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const file = Array.from(list)[0];
      if (!file) return;
      const ok = /image\/(png|jpe?g|webp|bmp)/i.test(file.type) || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
      if (!ok) {
        setUi({
          ...IDLE,
          phase: 'error',
          error: 'Formato não suportado. Envie uma foto em PNG, JPG, WEBP ou BMP.',
        });
        return;
      }
      setUi(IDLE);
      pickFile(file);
    },
    [pickFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const clearSelection = useCallback(() => {
    setSelected((prev) => {
      if (prev.preview) URL.revokeObjectURL(prev.preview);
      return { file: null, preview: null, width: 0, height: 0 };
    });
    setUi(IDLE);
  }, []);

  const enableCamera = useCallback(async () => {
    if (cameraOn) return;
    setUi({ ...IDLE, sourceLabel: 'Câmera' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setUi({
        ...IDLE,
        phase: 'error',
        error:
          'Não foi possível acessar a câmera. Verifique as permissões do navegador ou use o modo arquivo.',
      });
    }
  }, [cameraOn]);

  const captureAndRead = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0);
    await runOcr(canvas, 'Quadro da câmera');
  }, [runOcr]);

  const handleCopyJson = useCallback(async () => {
    const parsed = ui.parsed;
    if (!parsed) return;
    const text = parsedToJson(parsed);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [ui.parsed]);

  const handleManualParse = useCallback(() => {
    const parsed = parseMrzLines(manualText.split(/\r?\n/));
    setUi({
      phase: 'done',
      progress: 100,
      statusLabel: 'Pronto',
      parsed,
      rawText: manualText,
      sourceLabel: 'Linhas coladas manualmente',
      error: null,
    });
  }, [manualText]);

  const busy = ui.phase === 'loading' || ui.phase === 'working';
  const parsed = ui.parsed;
  const checksum = parsed?.allChecksValid;

  const rows: { label: string; value: string; empty: boolean }[] = parsed
    ? [
        {
          label: 'Tipo de documento',
          value: parsed.fields.documentTypeCode
            ? `${parsed.fields.documentTypeLabel} (${parsed.fields.documentTypeCode})`
            : 'Não identificado',
          empty: !parsed.fields.documentTypeCode,
        },
        { label: 'Formato MRZ', value: parsed.formatLabel, empty: false },
        { label: 'Nome completo', value: parsed.fields.fullName, empty: false },
        {
          label: 'Nº do documento',
          value: parsed.fields.documentNumber ?? '—',
          empty: !parsed.fields.documentNumber,
        },
        {
          label: 'Emissor',
          value: parsed.fields.issuingCountry
            ? `${parsed.fields.issuingCountry}${parsed.fields.issuingCountryName ? ` · ${parsed.fields.issuingCountryName}` : ''}`
            : '—',
          empty: !parsed.fields.issuingCountry,
        },
        {
          label: 'Data de nascimento',
          value: parsed.fields.birthDate
            ? `${parsed.fields.birthDate}${parsed.fields.birthDateRaw ? ` (${parsed.fields.birthDateRaw})` : ''}`
            : '—',
          empty: !parsed.fields.birthDate,
        },
        {
          label: 'Sexo / gênero',
          value: parsed.fields.sex
            ? `${parsed.fields.sex}${parsed.fields.sexLabel ? ` · ${parsed.fields.sexLabel}` : ''}`
            : '—',
          empty: !parsed.fields.sex,
        },
        {
          label: 'Nacionalidade',
          value: parsed.fields.nationality
            ? `${parsed.fields.nationality}${parsed.fields.nationalityName ? ` · ${parsed.fields.nationalityName}` : ''}`
            : '—',
          empty: !parsed.fields.nationality,
        },
        {
          label: 'Data de validade',
          value: parsed.fields.expiryDate
            ? `${parsed.fields.expiryDate}${parsed.fields.expiryDateRaw ? ` (${parsed.fields.expiryDateRaw})` : ''}`
            : '—',
          empty: !parsed.fields.expiryDate,
        },
        {
          label: 'Número pessoal (opcional)',
          value: parsed.fields.personalNumber ?? '—',
          empty: !parsed.fields.personalNumber,
        },
      ]
    : [];

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Error */}
      {ui.phase === 'error' && (
        <div className="flex items-center justify-between gap-3 border border-red-900 bg-[#09090B] px-4 py-3">
          <span className="font-mono text-sm text-red-400">{ui.error}</span>
          <button
            onClick={() => setUi(IDLE)}
            className="shrink-0 font-mono text-xs text-[#A1A1AA] transition-colors hover:text-white"
          >
            [X]
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="grid grid-cols-2 border border-[#27272A]">
        <button
          onClick={() => {
            stopCamera();
            setMode('file');
          }}
          className={`px-4 py-3 font-mono text-sm transition-colors ${
            mode === 'file'
              ? 'bg-[#18181B] text-white'
              : 'bg-[#09090B] text-[#A1A1AA] hover:text-white'
          }`}
        >
          [1] Foto / Documento
        </button>
        <button
          onClick={() => setMode('camera')}
          className={`px-4 py-3 font-mono text-sm transition-colors ${
            mode === 'camera'
              ? 'bg-[#18181B] text-white'
              : 'bg-[#09090B] text-[#A1A1AA] hover:text-white'
          }`}
        >
          [2] Câmera / Webcam
        </button>
      </div>

      {/* Mode: FILE */}
      {mode === 'file' && (
        <div className="flex flex-col gap-3">
          {!selected.preview && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-6 py-14 transition-colors ${
                dragOver
                  ? 'border-[#3F3F46] bg-[#18181B]'
                  : 'border-[#27272A] bg-[#09090B]'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <span className="font-mono text-sm text-white">
                Arraste a foto do passaporte / documento aqui
              </span>
              <span className="font-mono text-xs text-[#52525B]">
                PNG, JPG, WEBP ou BMP — ou clique para selecionar
              </span>
            </div>
          )}

          {selected.preview && (
            <div className="flex flex-col gap-2 border border-[#27272A] bg-[#09090B] p-3">
              <div className="flex items-center justify-between">
                <span className="truncate font-mono text-xs text-white" title={selected.file?.name}>
                  {selected.file?.name}
                </span>
                <button
                  onClick={clearSelection}
                  className="shrink-0 font-mono text-[11px] text-[#52525B] transition-colors hover:text-white"
                >
                  [Remover X]
                </button>
              </div>
              <div className="flex max-h-72 items-center justify-center overflow-hidden border border-[#27272A] bg-black">
                <img
                  src={selected.preview}
                  alt={selected.file?.name ?? 'documento'}
                  className="max-h-72 object-contain"
                />
              </div>
              <span className="font-mono text-[11px] text-[#52525B]">
                {selected.width}×{selected.height}px · {formatFileSize(selected.file?.size ?? 0)}
              </span>
              <button
                onClick={() => selected.file && void runOcr(selected.file, selected.file.name)}
                disabled={busy}
                className="border border-[#27272A] px-4 py-2 font-mono text-xs text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white disabled:opacity-40"
              >
                [Ler novamente]
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mode: CAMERA */}
      {mode === 'camera' && (
        <div className="flex flex-col gap-3">
          <div className="relative border border-[#27272A] bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`aspect-[4/3] w-full object-cover ${cameraOn ? '' : 'hidden'}`}
            />
            {!cameraOn && (
              <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3">
                <span className="font-mono text-xs text-[#52525B]">
                  A câmera fica 100% no seu dispositivo — o vídeo nunca sai da máquina.
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {!cameraOn ? (
              <button
                onClick={() => void enableCamera()}
                className="border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
              >
                [Ativar Câmera]
              </button>
            ) : (
              <>
                <button
                  onClick={() => void captureAndRead()}
                  disabled={busy}
                  className="border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40"
                >
                  {busy ? '[Capturando…]' : '[Capturar & Ler MRZ]'}
                </button>
                <button
                  onClick={stopCamera}
                  className="border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white"
                >
                  [Desligar Câmera]
                </button>
              </>
            )}
          </div>

          <p className="font-mono text-xs text-[#A1A1AA]">
            Enquadre a zona de leitura (MRZ) na parte inferior do documento, com boa
            iluminação, e capture o quadro.
          </p>
        </div>
      )}

      {/* Progress */}
      {busy && (
        <div className="flex flex-col gap-2 border border-[#27272A] bg-[#09090B] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-sm text-[#A1A1AA]">
              {ui.statusLabel || 'Processando…'}
            </span>
            <span className="font-mono text-xs text-[#52525B]">
              {ui.progress > 0 ? `${Math.min(100, Math.round(ui.progress))}%` : ''}
            </span>
          </div>
          <div className="h-1 w-full bg-[#27272A]">
            <div
              className="h-1 bg-[#A1A1AA] transition-all"
              style={{ width: `${Math.min(100, ui.progress)}%` }}
            />
          </div>
        </div>
      )}

      {/* Result */}
      {ui.phase === 'done' && parsed && (
        <div className="flex flex-col gap-3 border border-green-900 bg-[#09090B] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-sm text-green-400">
                [DOCUMENTO LIDO{parsed.format ? ` · ${parsed.format}` : ''}]
              </span>
              {ui.sourceLabel && (
                <span className="font-mono text-[10px] text-[#52525B]">
                  fonte: {ui.sourceLabel}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`border px-2 py-1 font-mono text-[10px] ${
                  checksum === true
                    ? 'border-green-700 bg-black text-green-400'
                    : checksum === false
                      ? 'border-red-900 bg-black text-red-400'
                      : 'border-[#27272A] bg-black text-[#52525B]'
                }`}
              >
                {checksum === true
                  ? '[CHECKSUM OK]'
                  : checksum === false
                    ? '[CHECKSUM FALHOU — CONFIRME OS DADOS]'
                    : '[SEM DÍGITOS DE CONTROLE]'}
              </span>
              <button
                onClick={() => void handleCopyJson()}
                className="border border-[#27272A] px-2.5 py-1 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white"
              >
                {copied ? '[Copiado!]' : '[Copiar Dados em JSON]'}
              </button>
            </div>
          </div>

          {parsed.ok ? (
            <div className="overflow-x-auto border border-[#27272A]">
              <table className="w-full border-collapse text-left">
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.label} className={i % 2 ? 'bg-black' : 'bg-[#09090B]'}>
                      <th className="w-1/2 border border-[#27272A] px-3 py-2 align-top font-mono text-[11px] font-normal text-[#52525B] sm:w-2/5">
                        {r.label}
                      </th>
                      <td className="border border-[#27272A] px-3 py-2 font-mono text-xs break-words text-white">
                        {r.empty ? <span className="text-[#52525B]">{r.value}</span> : r.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col gap-2 border border-yellow-900 bg-black px-3 py-2.5">
              <span className="font-mono text-[11px] font-medium text-yellow-300">
                [MRZ NÃO RECONHECIDO]
              </span>
              {parsed.warnings.map((w, i) => (
                <p key={i} className="text-xs leading-relaxed text-[#A1A1AA]">
                  {w}
                </p>
              ))}
              <p className="text-xs leading-relaxed text-[#A1A1AA]">
                Use uma imagem mais nítida, com o documento bem iluminado e sem reflexos —
                ou cole as linhas manualmente abaixo.
              </p>
            </div>
          )}

          {/* Per-check chips */}
          {parsed.checks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {parsed.checks.map((c) => (
                <span
                  key={c.label}
                  className={`border px-2 py-1 font-mono text-[10px] ${
                    c.valid === null
                      ? 'border-[#27272A] bg-black text-[#52525B]'
                      : c.valid
                        ? 'border-green-900 bg-black text-green-400'
                        : 'border-red-900 bg-black text-red-400'
                  }`}
                  title={
                    c.expected && c.stored !== null
                      ? `esperado ${c.expected} · encontrado ${c.stored}`
                      : ''
                  }
                >
                  {c.valid === null
                    ? `${c.label.toUpperCase()}: SEM DÍGITO`
                    : c.valid
                      ? `${c.label.toUpperCase()}: OK`
                      : `${c.label.toUpperCase()}: INVÁLIDO`}
                </span>
              ))}
            </div>
          )}

          {/* Raw MRZ lines */}
          {parsed.lines.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-widest text-[#52525B]">
                // LINHAS MRZ
              </span>
              {parsed.lines.map((l, i) => (
                <code
                  key={i}
                  className="border border-[#27272A] bg-black px-3 py-2 font-mono text-xs text-[#A1A1AA]"
                >
                  {l}
                </code>
              ))}
            </div>
          )}

          {/* Warnings */}
          {parsed.warnings.length > 0 && parsed.ok && (
            <div className="flex flex-col gap-1 border border-yellow-900 bg-black px-3 py-2">
              {parsed.warnings.map((w, i) => (
                <p key={i} className="text-xs leading-relaxed text-yellow-200">
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual paste fallback */}
      <details className="border border-[#27272A] bg-[#09090B]">
        <summary className="cursor-pointer px-4 py-3 font-mono text-xs text-[#A1A1AA] transition-colors hover:text-white">
          // OCR falhou? Cole as linhas MRZ manualmente (uma por linha)
        </summary>
        <div className="flex flex-col gap-3 border-t border-[#27272A] p-4">
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            spellCheck={false}
            placeholder={'P<UTOERIKSSON<<ANNA<MARIA<...\nL898902C36UTO7408122F1204159ZE184226B<<<<<10'}
            className="min-h-[96px] w-full resize-y border border-[#27272A] bg-black px-3 py-2 font-mono text-xs text-white outline-none placeholder:text-[#52525B] focus:border-[#3F3F46]"
          />
          <button
            onClick={handleManualParse}
            disabled={manualText.trim().length === 0}
            className="self-start border border-[#27272A] px-4 py-2 font-mono text-xs text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40"
          >
            [Interpretar Linhas MRZ]
          </button>
          <p className="font-mono text-[10px] text-[#52525B]">
            O parse valida nome, nº do documento, datas e dígitos de controle (ICAO 9303).
          </p>
        </div>
      </details>

      <p className="font-mono text-xs text-[#A1A1AA]">
        O reconhecimento roda em um Web Worker (Tesseract.js) no seu navegador. A imagem e os
        dados decodificados nunca são enviados a servidores.
      </p>

      {/* Support Modal */}
      {showSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="mx-4 flex w-full max-w-md flex-col gap-5 border border-[#27272A] bg-[#09090B] p-8">
            <h3 className="text-center font-mono text-lg font-bold tracking-tight text-white">
              Mantenha o CofreUtil no Ar
            </h3>
            <p className="text-center text-sm leading-relaxed text-[#A1A1AA]">
              Ferramenta 100% gratuita e privada (zero servidores). Se te economizou tempo,
              considere apoiar o projeto com qualquer valor via Pix.
            </p>
            <div className="border border-[#27272A] bg-black px-4 py-3 text-center">
              <span className="font-mono text-sm text-white">
                Chave Pix: apoio@grupows.com
              </span>
            </div>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(pixPayload);
                setPixCopied(true);
                setTimeout(() => setPixCopied(false), 2000);
              }}
              className="border border-[#27272A] bg-[#09090B] px-4 py-3 text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
            >
              {pixCopied ? '[Copiado com Sucesso!]' : '[Copiar Pix Copia e Cola]'}
            </button>
            <button
              onClick={() => setShowSupport(false)}
              className="self-center text-xs text-[#52525B] transition-colors hover:text-white"
            >
              Continuar sem apoiar →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
