pub const RIGHT_ALT_HOTKEY_MIGRATION_VERSION: u32 = 1;

pub fn should_mark_windows_right_alt_migration(migration_version: u32) -> bool {
    migration_version < RIGHT_ALT_HOTKEY_MIGRATION_VERSION
}

pub fn should_repair_windows_right_alt_default_hold(
    migration_version: u32,
    trigger_is_right_alt: bool,
    mode_is_hold: bool,
    dictation_primary: &str,
    dictation_modifiers_empty: bool,
    has_custom_combo_hotkey: bool,
) -> bool {
    should_mark_windows_right_alt_migration(migration_version)
        && trigger_is_right_alt
        && mode_is_hold
        && dictation_primary.eq_ignore_ascii_case("RightAlt")
        && dictation_modifiers_empty
        && !has_custom_combo_hotkey
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_default_right_alt_hold_should_be_repaired_once() {
        assert!(should_repair_windows_right_alt_default_hold(
            0, true, true, "RightAlt", true, false
        ));
        assert!(!should_repair_windows_right_alt_default_hold(
            RIGHT_ALT_HOTKEY_MIGRATION_VERSION,
            true,
            true,
            "RightAlt",
            true,
            false
        ));
    }

    #[test]
    fn customized_hotkeys_are_not_repaired() {
        assert!(!should_repair_windows_right_alt_default_hold(
            0,
            true,
            true,
            "RightAlt",
            true,
            true
        ));
        assert!(!should_repair_windows_right_alt_default_hold(
            0, true, true, "KeyJ", false, false
        ));
    }
}
