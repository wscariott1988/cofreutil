interface OfflineChallengeBadgeProps {
  className?: string;
}

const offlineMessage =
  '🔒 PROVA DE PRIVACIDADE: Carregue esta página, desligue a internet do seu celular ou PC (modo avião) e processe seu arquivo. A ferramenta funcionará de forma 100% instantânea porque roda localmente na memória do seu navegador. Zero servidores, privacidade de cofre.';

export default function OfflineChallengeBadge({ className = '' }: OfflineChallengeBadgeProps) {
  return (
    <section
      aria-label="Desafio Offline de Privacidade"
      className={`mt-8 rounded-none border border-[#27272A] bg-[#09090B] p-5 font-mono text-xs leading-relaxed text-[#A1A1AA] md:p-6 ${className}`}
    >
      <p className="font-bold uppercase tracking-wider text-white">
        [ DESAFIO OFFLINE DE PRIVACIDADE ]
      </p>
      <p className="mt-3">{offlineMessage}</p>
    </section>
  );
}