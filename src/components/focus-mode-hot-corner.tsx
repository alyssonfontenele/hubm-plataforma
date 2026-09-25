interface FocusModeHotCornerProps {
  onReveal: () => void;
}

/** Área invisível de 24×24px no canto superior esquerdo: passar o mouse revela a sidebar e a topbar no modo foco. */
export function FocusModeHotCorner({ onReveal }: FocusModeHotCornerProps) {
  return (
    <div
      aria-hidden
      onMouseEnter={onReveal}
      className="fixed left-0 top-0 z-[100] h-6 w-6"
    />
  );
}
