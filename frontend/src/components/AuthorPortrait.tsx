import { UserRound } from 'lucide-react';

export function AuthorPortrait({ name, photo, decorative = false }: { name: string; photo: string | null; decorative?: boolean }) {
  return <span className="author-portrait" aria-hidden={decorative || undefined}>
    {photo ? <img src={photo} alt={decorative ? '' : 'Portrait of ' + name} width={210} height={188} />
      : <UserRound size="42%" strokeWidth={1.3} aria-hidden="true" />}
  </span>;
}
