import { publisherLogoPath } from '../../../shared/site';

export function PublisherLogo({ className = 'publisher-logo', alt = 'Bhagwati Publications' }: {
  className?: string;
  alt?: string;
}) {
  return <img className={className} src={publisherLogoPath} width="1600" height="533" alt={alt} />;
}
