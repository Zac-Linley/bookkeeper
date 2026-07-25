-- Migration 0002: Update category icons to Tabler icon names
-- Run: npx wrangler d1 execute bookkeeper-db --file=./migrations/0002_tabler_icons.sql --remote

UPDATE categories SET icon = 'car' WHERE name = '车辆' AND is_system = 1;
UPDATE categories SET icon = 'utensils' WHERE name = '餐费' AND is_system = 1;
UPDATE categories SET icon = 'wifi' WHERE name = '通讯网络' AND is_system = 1;
UPDATE categories SET icon = 'truck' WHERE name = '快递' AND is_system = 1;
UPDATE categories SET icon = 'package' WHERE name = '物料' AND is_system = 1;
UPDATE categories SET icon = 'shield' WHERE name = '劳保' AND is_system = 1;
UPDATE categories SET icon = 'tool' WHERE name = '维修' AND is_system = 1;
UPDATE categories SET icon = 'printer' WHERE name = '办公' AND is_system = 1;
UPDATE categories SET icon = 'bulb' WHERE name = '水电' AND is_system = 1;
UPDATE categories SET icon = 'plane' WHERE name = '差旅' AND is_system = 1;
UPDATE categories SET icon = 'dots' WHERE name = '其他' AND is_system = 1;
UPDATE categories SET icon = 'cash' WHERE name = '工资' AND is_system = 1;
UPDATE categories SET icon = 'gift' WHERE name = '红包' AND is_system = 1;
