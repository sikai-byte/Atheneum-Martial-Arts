const URL_PATTERN = /(https?:\/\/[^\s<]+)/g;

export default function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-brand underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
}
