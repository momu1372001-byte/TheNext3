import {
  Home,
  UtensilsCrossed,
  Plane,
  Briefcase,
  GraduationCap,
  Heart,
  Trees,
  Cpu,
  Activity,
  Users,
  Palette,
  Music,
  Shirt,
  Trophy,
  Car,
  Cloud,
  Building2,
  BookOpen,
  Baby,
  Tag,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  UtensilsCrossed,
  Plane,
  Briefcase,
  GraduationCap,
  Heart,
  Trees,
  Cpu,
  Activity,
  Users,
  Palette,
  Music,
  Shirt,
  Trophy,
  Car,
  Cloud,
  Building2,
  BookOpen,
  Baby,
};

type CategoryIconProps = {
  name: string;
  size?: number;
  className?: string;
};

/**
 * Renders a lucide-react icon by its string name from categories.json.
 * Falls back to a Tag icon if the name isn't recognized.
 */
export function CategoryIcon({ name, size = 18, className = '' }: CategoryIconProps) {
  const Icon = ICON_MAP[name] ?? Tag;
  return <Icon size={size} className={className} />;
}

export default CategoryIcon;
