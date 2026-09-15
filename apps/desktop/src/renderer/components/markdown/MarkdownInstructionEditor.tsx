import { useState } from 'react';
import { MarkdownEditorTabs } from './MarkdownEditorTabs';
import { MarkdownPreview } from './MarkdownPreview';
export function MarkdownInstructionEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) { const [preview, setPreview] = useState(false); return <section className="markdown-editor"><label htmlFor="instructions-markdown">Instructions</label><MarkdownEditorTabs preview={preview} onChange={setPreview} />{preview ? <MarkdownPreview value={value} /> : <textarea id="instructions-markdown" spellCheck={false} value={value} onChange={event => onChange(event.target.value)} placeholder="# Responsibilities" />}</section>; }
