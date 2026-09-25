interface FocusModeHotCornerProps {
  onReveal: () => void;
}

/**
 * Marca "H" fixa no canto superior esquerdo do modo foco: fica bem discreta
 * (opacidade baixa) e some para o overlay da sidebar ao passar o mouse ou
 * clicar (cobre touch).
 */
export function FocusModeHotCorner({ onReveal }: FocusModeHotCornerProps) {
  return (
    <button
      type="button"
      onMouseEnter={onReveal}
      onClick={onReveal}
      aria-label="Mostrar menu"
      className="fixed left-3 top-3 z-[100] flex h-10 w-10 items-center justify-center rounded-md bg-foreground text-background text-base font-bold opacity-[0.15] transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100"
    >
      H
    </button>
  );
}
