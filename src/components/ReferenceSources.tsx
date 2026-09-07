interface ReferenceSource {
  label: string;
  href: string;
}

interface ReferenceSourcesProps {
  sources: ReferenceSource[];
}

export default function ReferenceSources({ sources }: ReferenceSourcesProps) {
  return (
    <div className="border-t border-[#27272A] pt-4">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[#52525B]">
        [Referências e Fontes Técnicas Primárias]
      </span>
      <ul className="mt-2 flex flex-col gap-1 font-mono text-[10px] leading-relaxed text-[#52525B]">
        {sources.map((source) => (
          <li key={source.href}>
            <a
              href={source.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="underline decoration-dotted underline-offset-2 transition-colors hover:text-[#A1A1AA]"
            >
              {source.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}