/**
 * Correspondance unique entre une notion metier et son icone.
 *
 * Une notion porte toujours la meme icone dans toute l'application. Aucun
 * composant n'importe directement depuis `lucide-react` : il passe par cette
 * table, faute de quoi la meme notion finit par porter trois icones
 * differentes selon l'ecran.
 *
 * Aucun caractere emoji dans l'application. `npm run lint:emoji` le verifie.
 */

import {
  AlertTriangle,
  Banknote,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardList,
  CloudSun,
  Download,
  FileText,
  FlaskConical,
  Flag,
  GanttChartSquare,
  Layers,
  ListChecks,
  LogOut,
  Map as MapIcon,
  Minus,
  OctagonAlert,
  Package,
  PauseCircle,
  Pencil,
  Plus,
  Search,
  Settings,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react'

export const Icone = {
  /* Entites */
  projet: Building2,
  lot: Layers,
  tache: ListChecks,
  jalon: Flag,
  zone: MapIcon,
  ressource: Package,
  engin: Truck,
  equipe: Users,

  /* Ecrans */
  tableauBord: TrendingUp,
  planning: GanttChartSquare,
  releve: ClipboardList,
  quantitatif: ListChecks,
  plan: MapIcon,
  photos: Camera,
  analyses: TrendingUp,
  simulation: FlaskConical,
  rapports: FileText,

  /* Notions */
  cout: Banknote,
  effectif: Users,
  meteo: CloudSun,
  calendrier: Calendar,
  materiaux: Package,

  /* Etats et signaux */
  alerte: AlertTriangle,
  nonConformite: OctagonAlert,
  valide: CheckCircle2,
  enCours: Circle,
  nonCommence: Circle,
  chome: PauseCircle,
  hausse: TrendingUp,
  baisse: TrendingDown,
  stable: Minus,

  /* Actions */
  ajouter: Plus,
  modifier: Pencil,
  rechercher: Search,
  exporter: Download,
  parametres: Settings,
  deconnexion: LogOut,
  deplier: ChevronRight,
} as const satisfies Record<string, LucideIcon>

export type NomIcone = keyof typeof Icone
