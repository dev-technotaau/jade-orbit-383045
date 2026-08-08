'use client';

import { useEffect } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import { promptDialog } from '@/components/ui/dialog-service';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Unlink,
  Highlighter,
  Baseline,
  Undo,
  Redo,
  RemoveFormatting,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Tooltip from './Tooltip';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /**
   * Render read-only.
   *
   * Needed because TipTap is contentEditable, not a form control, so a
   * wrapping `<fieldset disabled>` does NOT reach it. Without this, the
   * admin soft-lock's read-only mode left every rich-text field fully
   * editable while all the plain inputs around them were inert.
   */
  disabled?: boolean;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <Tooltip content={title}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'rounded p-1.5 transition-colors',
          active
            ? 'bg-primary/10 text-primary'
            : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]',
          disabled && 'cursor-not-allowed opacity-40',
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

const Divider = () => <div className="mx-1 h-5 w-px bg-[var(--border)]" />;

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = async () => {
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = await promptDialog({
      title: 'Insert link',
      label: 'URL',
      defaultValue: previousUrl || 'https://',
    });
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const iconSize = 'h-4 w-4';
  const currentColor = (editor.getAttributes('textStyle').color as string | undefined) ?? '#111827';

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] px-2 py-1.5">
      {/* Inline marks */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold"
      >
        <Bold className={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic"
      >
        <Italic className={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title="Underline"
      >
        <UnderlineIcon className={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Strikethrough"
      >
        <Strikethrough className={iconSize} />
      </ToolbarButton>

      {/* Text color + highlight */}
      <Tooltip content="Text color">
        <label className="relative flex cursor-pointer items-center rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]">
          <Baseline className={iconSize} style={{ color: currentColor }} />
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(currentColor) ? currentColor : '#111827'}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Text color"
          />
        </label>
      </Tooltip>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        active={editor.isActive('highlight')}
        title="Highlight"
      >
        <Highlighter className={iconSize} />
      </ToolbarButton>

      <Divider />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        <Heading1 className={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        <Heading2 className={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        <Heading3 className={iconSize} />
      </ToolbarButton>

      <Divider />

      {/* Lists + blocks */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet list"
      >
        <List className={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Numbered list"
      >
        <ListOrdered className={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="Quote"
      >
        <Quote className={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Divider"
      >
        <Minus className={iconSize} />
      </ToolbarButton>

      <Divider />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        active={editor.isActive({ textAlign: 'left' })}
        title="Align left"
      >
        <AlignLeft className={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        active={editor.isActive({ textAlign: 'center' })}
        title="Align center"
      >
        <AlignCenter className={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        active={editor.isActive({ textAlign: 'right' })}
        title="Align right"
      >
        <AlignRight className={iconSize} />
      </ToolbarButton>

      <Divider />

      {/* Links */}
      <ToolbarButton onClick={setLink} active={editor.isActive('link')} title="Add link">
        <LinkIcon className={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
        disabled={!editor.isActive('link')}
        title="Remove link"
      >
        <Unlink className={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        title="Clear formatting"
      >
        <RemoveFormatting className={iconSize} />
      </ToolbarButton>

      <Divider />

      {/* History */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo"
      >
        <Undo className={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo"
      >
        <Redo className={iconSize} />
      </ToolbarButton>
    </div>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  label,
  placeholder,
  error,
  required,
  className,
  disabled = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    // Initial value only — TipTap reads this once at construction, so a
    // later `disabled` flip needs `setEditable` (below). Passing it here as
    // well means an editor that mounts already-disabled starts correct.
    editable: !disabled,
    extensions: [
      // StarterKit already bundles bold/italic/underline/strike/heading/lists/
      // blockquote/horizontalRule + undo/redo. Disable its link so the custom
      // Link config below (no open-on-click) is the single link extension.
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary underline' } }),
      Placeholder.configure({ placeholder: placeholder || 'Start writing...' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: value,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
  });

  /**
   * Apply `disabled` changes AFTER mount.
   *
   * `useEditor`'s config is read once at construction, so the initial
   * `editable` above never updates. Without this the admin soft-lock's
   * read-only mode had no effect on any rich-text field in practice: the
   * lock is acquired asynchronously, so `disabled` is virtually always
   * false on the render that constructs the editor and true only later.
   */
  useEffect(() => {
    if (editor && editor.isEditable === disabled) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </label>
      )}
      <div
        className={cn(
          'overflow-hidden rounded-lg border border-[var(--border)] bg-white transition-colors',
          'focus-within:border-primary focus-within:ring-primary/20 focus-within:ring-2',
          error && 'border-error focus-within:border-error focus-within:ring-error/20',
          disabled && 'cursor-not-allowed bg-[var(--bg-secondary)] opacity-60',
        )}
      >
        {editor && !disabled && <Toolbar editor={editor} />}
        <EditorContent
          editor={editor}
          className="prose prose-sm min-h-[120px] max-w-none px-3 py-2 text-sm text-[var(--text)] [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-[var(--text-muted)] [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap]:min-h-[100px] [&_.tiptap]:outline-none"
        />
      </div>
      {error && <p className="text-error mt-1 text-sm">{error}</p>}
    </div>
  );
}
