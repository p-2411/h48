// Text with **bold** and *italic* shown as such, the way models tend to write them. Anything else is
// plain text: no HTML is ever interpreted.
export function Inline({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g)
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <strong key={index}>{part.slice(2, -2)}</strong>
        ) : part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
          <em key={index}>{part.slice(1, -1)}</em>
        ) : (
          part
        )
      )}
    </>
  )
}
