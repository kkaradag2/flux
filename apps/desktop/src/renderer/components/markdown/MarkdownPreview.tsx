import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
export function MarkdownPreview({ value }: { value: string }) { return <div className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children }) => <span className="markdown-link">{children}</span>, img: ({ alt }) => <span>{alt ? '[Image: ' + alt + ']' : '[Image]'}</span> }}>{value || '*No instructions yet.*'}</ReactMarkdown></div>; }
