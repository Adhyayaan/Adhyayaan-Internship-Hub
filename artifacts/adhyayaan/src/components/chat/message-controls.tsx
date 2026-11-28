import { useState } from 'react';
import { MoreHorizontal, Pencil, Reply, SmilePlus, Trash2 } from 'lucide-react';
import type { ChatReaction, ChatReactionInputReaction } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const reactions: { value: ChatReactionInputReaction; label: string; mark: string }[] = [
  { value: 'like', label: 'Like', mark: '👍' },
  { value: 'heart', label: 'Heart', mark: '❤️' },
  { value: 'laugh', label: 'Laugh', mark: '😂' },
  { value: 'surprise', label: 'Surprise', mark: '😮' },
  { value: 'celebrate', label: 'Celebrate', mark: '🎉' },
];

export function ReactionPills({ messageId, values, onToggle, disabled }: {
  messageId: string;
  values: ChatReaction[];
  onToggle: (reaction: ChatReactionInputReaction) => void;
  disabled?: boolean;
}) {
  if (!values.length) return null;
  return <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`list-message-reactions-${messageId}`}>
    {values.map((item) => {
      const meta = reactions.find((reaction) => reaction.value === item.reaction);
      if (!meta) return null;
      return <button key={item.reaction} type="button" disabled={disabled} onClick={() => onToggle(item.reaction)}
        aria-label={`${meta.label}, ${item.count}${item.selected ? ', selected' : ''}`}
        aria-pressed={item.selected}
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-50 ${item.selected ? 'border-[hsl(var(--ledger))]/40 bg-[hsl(var(--ledger-soft))] text-primary shadow-sm' : 'border-border bg-background text-foreground hover:border-[hsl(var(--ledger))]/30'}`}
        data-testid={`button-message-reaction-${messageId}-${item.reaction}`}>
        <span aria-hidden="true">{meta.mark}</span><span>{item.count}</span>
      </button>;
    })}
  </div>;
}

export function MessageToolbar({ messageId, canReply, canEdit, canDelete, onReply, onEdit, onDelete, onReact, busy }: {
  messageId: string;
  canReply: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onReact: (reaction: ChatReactionInputReaction) => void;
  busy?: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  return <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border/50 pt-1.5">
    {canReply && <Button type="button" variant="ghost" size="sm" onClick={onReply} disabled={busy}
      className="h-8 gap-1.5 px-2.5 text-[11px] text-muted-foreground hover:text-primary"
      data-testid={`button-reply-${messageId}`}><Reply className="h-3.5 w-3.5" />Reply</Button>}
    <Popover>
      <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" disabled={busy}
        className="h-8 gap-1.5 px-2.5 text-[11px] text-muted-foreground hover:text-primary"
        aria-label="Add a reaction" data-testid={`button-open-reactions-${messageId}`}><SmilePlus className="h-3.5 w-3.5" />React</Button></PopoverTrigger>
      <PopoverContent align="start" className="w-auto rounded-2xl border-border bg-card p-2 shadow-lg">
        <div className="flex items-center gap-1" role="group" aria-label="Choose a reaction">
          {reactions.map((reaction) => <button key={reaction.value} type="button" onClick={() => onReact(reaction.value)}
            disabled={busy} aria-label={reaction.label} title={reaction.label}
            className="grid h-10 w-10 place-items-center rounded-xl text-xl transition-transform hover:scale-110 hover:bg-secondary disabled:opacity-50"
            data-testid={`button-react-${messageId}-${reaction.value}`}>{reaction.mark}</button>)}
        </div>
      </PopoverContent>
    </Popover>
    {(canEdit || canDelete) && <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" disabled={busy}
        className="ml-auto h-8 w-8 rounded-lg text-muted-foreground" aria-label="More message actions"
        data-testid={`button-message-actions-${messageId}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {canEdit && <DropdownMenuItem onSelect={onEdit} data-testid={`button-edit-message-${messageId}`}><Pencil className="h-4 w-4" />Edit message</DropdownMenuItem>}
        {canDelete && <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="text-destructive focus:text-destructive" data-testid={`button-delete-message-${messageId}`}><Trash2 className="h-4 w-4" />Delete message</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>}
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this message?</AlertDialogTitle>
          <AlertDialogDescription>This hides the message and its attachments for everyone in this conversation. This cannot be undone here.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep message</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void onDelete().then(() => setDeleteOpen(false)).catch(() => {}); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid={`button-confirm-delete-${messageId}`}>
            {busy ? 'Deleting…' : 'Delete for everyone'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
