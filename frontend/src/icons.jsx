// Central icon module — the platform's one deliberate icon identity.
//
// Every screen used to pull straight from `@ant-design/icons`: thin single-
// stroke outlines, the same set every other antd admin panel ships with.
// This file re-exports the exact same names (so call sites never changed,
// only their import source) backed by Phosphor's "duotone" weight instead —
// a light fill layer riding under each stroke, which is what actually reads
// as "premium" rather than "default antd" at a glance. Weight can still be
// overridden per call site (`weight="fill"` etc.) when a spot needs more
// visual weight (e.g. a selected/active state).
//
// A couple of names were re-pointed to a better-fitting Phosphor icon than a
// literal 1:1 antd match would give (VideoCameraAddOutlined → a real
// "camera off" glyph instead of antd's mismatched "add" stand-in; PhoneOutlined
// → a real hang-up glyph instead of a phone rotated 135°) — noted inline.
import { forwardRef } from 'react';
import * as Ph from '@phosphor-icons/react';

const DEFAULT_WEIGHT = 'duotone';

function icon(Glyph, defaultWeight = DEFAULT_WEIGHT) {
  const Wrapped = forwardRef(({ weight, spin, className, ...props }, ref) => (
    <Glyph
      ref={ref}
      weight={weight || defaultWeight}
      className={spin ? `icon-spin${className ? ` ${className}` : ''}` : className}
      {...props}
    />
  ));
  Wrapped.displayName = `Icon(${Glyph.displayName || Glyph.name || 'Phosphor'})`;
  return Wrapped;
}

// antd's *TwoTone icons take a `twoToneColor` prop instead of `color` —
// translate it so the two families are drop-in compatible.
function twoToneIcon(Glyph) {
  const Wrapped = forwardRef(({ twoToneColor, weight, ...props }, ref) => (
    <Glyph ref={ref} weight={weight || 'duotone'} color={twoToneColor} {...props} />
  ));
  Wrapped.displayName = `IconTwoTone(${Glyph.displayName || Glyph.name || 'Phosphor'})`;
  return Wrapped;
}

export const ArrowLeftOutlined = icon(Ph.ArrowLeft);
export const ArrowRightOutlined = icon(Ph.ArrowRight);
export const AtomOutlined = icon(Ph.Atom);
export const AudioOutlined = icon(Ph.Microphone);
export const AudioMutedOutlined = icon(Ph.MicrophoneSlash);
export const BankOutlined = icon(Ph.Buildings);
export const BarbellOutlined = icon(Ph.Barbell);
export const BarChartOutlined = icon(Ph.ChartBar);
export const BellOutlined = icon(Ph.Bell);
export const BookOutlined = icon(Ph.BookOpen);
export const BulbOutlined = icon(Ph.Lightbulb);
export const CalculatorOutlined = icon(Ph.Calculator);
export const CalendarOutlined = icon(Ph.CalendarBlank);
export const CameraOutlined = icon(Ph.Camera);
export const ChartLineOutlined = icon(Ph.ChartLine);
export const CheckCircleOutlined = icon(Ph.CheckCircle);
export const CheckCircleTwoTone = twoToneIcon(Ph.CheckCircle);
export const CheckOutlined = icon(Ph.Check);
export const CheckSquareOutlined = icon(Ph.CheckSquare);
export const ClockCircleOutlined = icon(Ph.Clock);
export const CloseOutlined = icon(Ph.X);
export const CodeOutlined = icon(Ph.Code);
export const CrownOutlined = icon(Ph.Crown);
export const DashboardOutlined = icon(Ph.Gauge);
export const DatabaseOutlined = icon(Ph.Database);
export const DeleteOutlined = icon(Ph.Trash);
export const DesktopOutlined = icon(Ph.Monitor);
export const DownloadOutlined = icon(Ph.DownloadSimple);
export const DownOutlined = icon(Ph.CaretDown);
export const EditOutlined = icon(Ph.PencilSimple);
export const EyeOutlined = icon(Ph.Eye);
export const FileDoneOutlined = icon(Ph.ClipboardText);
export const FileTextOutlined = icon(Ph.FileText);
export const FlaskOutlined = icon(Ph.Flask);
export const GlobalOutlined = icon(Ph.Globe);
export const HistoryOutlined = icon(Ph.ClockCounterClockwise);
export const InboxOutlined = icon(Ph.Tray);
export const LeafOutlined = icon(Ph.Leaf);
export const LockOutlined = icon(Ph.Lock);
export const LoginOutlined = icon(Ph.SignIn);
export const LogoutOutlined = icon(Ph.SignOut);
export const MailOutlined = icon(Ph.Envelope);
export const MenuFoldOutlined = icon(Ph.CaretLineLeft);
export const MenuUnfoldOutlined = icon(Ph.CaretLineRight);
export const MusicNoteOutlined = icon(Ph.MusicNotes);
export const NotificationOutlined = icon(Ph.Megaphone);
export const PaletteOutlined = icon(Ph.Palette);
// antd's PhoneOutlined was used rotated 135° to fake a "hang up" glyph;
// Phosphor has the real thing, so the rotate prop at the call site is gone.
export const PhoneOutlined = icon(Ph.PhoneDisconnect);
// A plain handset for showing a contact number (profile, user lists) — kept
// apart from PhoneOutlined above, which reads as "hang up" and is only for
// the live-call control bar.
export const PhoneCallOutlined = icon(Ph.Phone);
export const PictureOutlined = icon(Ph.Image);
export const PlayCircleOutlined = icon(Ph.PlayCircle);
export const PlusOutlined = icon(Ph.Plus);
// The Live Classroom's "spotlight this student" control — a pin, filled once
// a tile is the one pinned to the stage.
export const PushpinOutlined = icon(Ph.PushPin);
export const ProfileOutlined = icon(Ph.IdentificationCard);
export const QuestionCircleOutlined = icon(Ph.Question);
export const ReadOutlined = icon(Ph.Books);
export const ReloadOutlined = icon(Ph.ArrowsClockwise);
export const SafetyCertificateOutlined = icon(Ph.SealCheck);
export const SafetyOutlined = icon(Ph.ShieldCheck);
export const ScalesOutlined = icon(Ph.Scales);
export const ScrollOutlined = icon(Ph.Scroll);
export const SearchOutlined = icon(Ph.MagnifyingGlass);
export const SendOutlined = icon(Ph.PaperPlaneTilt);
export const SettingOutlined = icon(Ph.GearSix);
export const SolutionOutlined = icon(Ph.ChalkboardTeacher);
export const StopOutlined = icon(Ph.StopCircle);
export const TeamOutlined = icon(Ph.UsersThree);
export const TranslateOutlined = icon(Ph.Translate);
export const TrophyOutlined = icon(Ph.Trophy);
export const UploadOutlined = icon(Ph.UploadSimple);
export const UserAddOutlined = icon(Ph.UserPlus);
export const UserOutlined = icon(Ph.User);
// antd had no real "camera off" icon, so the app reused VideoCameraAddOutlined
// as a stand-in for the muted state — Phosphor has the correct glyph.
export const VideoCameraAddOutlined = icon(Ph.VideoCameraSlash);
export const VideoCameraOutlined = icon(Ph.VideoCamera);
export const WarningOutlined = icon(Ph.WarningCircle);
