import { useState, type FormEvent, type ReactNode } from "react";
import type { CowDraft } from "../types";
import { Button, Field, TextArea, TextInput } from "./ui";

export function CowForm({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
  extraAction,
}: {
  initial?: CowDraft;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (draft: CowDraft) => void;
  extraAction?: ReactNode;
}) {
  const [tag, setTag] = useState(initial?.tag ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ tag, name, notes });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <Field label="Eartag" hint="The number or code on the tag.">
        <TextInput
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          inputMode="text"
          required
          autoFocus
        />
      </Field>
      <Field label="Name" hint="Optional">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bossy"
        />
      </Field>
      <Field label="Notes" hint="Coat, pasture, anything useful">
        <TextArea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Hangs near the north tank"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" className="flex-1">
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {extraAction}
    </form>
  );
}
