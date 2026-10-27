import {
  AppstoreOutlined,
  BarChartOutlined,
  BookOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  DollarOutlined,
  EditOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  HomeOutlined,
  NotificationOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  SolutionOutlined,
  TeamOutlined,
  ToolOutlined,
  UserSwitchOutlined,
  WalletOutlined,
} from '@ant-design/icons-vue'

export const MENU_ICON_MAP = {
  AppstoreOutlined,
  BarChartOutlined,
  BookOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  DollarOutlined,
  EditOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  HomeOutlined,
  NotificationOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  SolutionOutlined,
  TeamOutlined,
  ToolOutlined,
  UserSwitchOutlined,
  WalletOutlined,
}

export const MENU_ICON_OPTIONS = Object.keys(MENU_ICON_MAP)

export function resolveMenuIcon(name) {
  return MENU_ICON_MAP[name] || AppstoreOutlined
}
