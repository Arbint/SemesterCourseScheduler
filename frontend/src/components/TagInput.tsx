import { useState, type KeyboardEvent } from 'react'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
}

export function TagInput({ value, onChange }: TagInputProps) {
  const [input, setInput] = useState('')

  const add = () => {
    const tag = input.trim()
    if (tag && !value.includes(tag)) {
      onChange([...value, tag])
    }
    setInput('')
  }

  const remove = (tag: string) => onChange(value.filter(t => t !== tag))

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
    if (e.key === 'Backspace' && !input && value.length) remove(value[value.length - 1])
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 8px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', minHeight: 36, alignItems: 'center' }}>
      {value.map(t => (
        <span key={t} className="tag" style={{ cursor: 'default' }}>
          {t}
          <button onClick={() => remove(t)} style={{ background: 'none', padding: '0 0 0 4px', color: 'inherit', fontWeight: 'bold', minWidth: 'unset' }}>×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={value.length ? '' : 'Add tag...'}
        style={{ border: 'none', background: 'none', outline: 'none', flex: 1, minWidth: 80, padding: '0 2px', color: 'var(--text-primary)' }}
      />
    </div>
  )
}
