use regex::Regex;

pub const TYPES: [&str; 9] = [
    "Overview",
    "Lectures",
    "Tutorials",
    "Assignments",
    "Exams",
    "Labs",
    "Readings",
    "Pages",
    "Unsorted",
];

pub fn normalize_category(value: &str) -> &str {
    match value {
        "课程大纲" | "Syllabus" => "Overview",
        "讲义" | "Lecture" => "Lectures",
        "练习" | "Tutorial" => "Tutorials",
        "作业" | "Assignment" => "Assignments",
        "考试" | "Exam" => "Exams",
        "参考资料" | "Reading" => "Readings",
        "未分类" => "Unsorted",
        _ => value,
    }
}

pub fn infer_type(name: &str, relative: &str) -> &'static str {
    let extension = name.rsplit('.').next().unwrap_or("").to_lowercase();
    let path = relative.to_lowercase();
    if ["md", "html", "htm"].contains(&extension.as_str())
        && (path.contains("/pages/") || path.contains("/announcements/"))
    {
        return "Pages";
    }
    let rules = [
        (
            "Overview",
            r"(?i)syllabus|course.?outline|teaching.?schedule|assessment.?rubric|course.?information",
        ),
        ("Exams", r"(?i)exam|midterm|past.?test|revision|\bquiz\b"),
        (
            "Assignments",
            r"(?i)assignment|\bassign\d*|\bassessment\b|\bproject\b|homework",
        ),
        (
            "Tutorials",
            r"(?i)tutorial|(?:^|[ _.-])tut(?:\b|[_ -]|\d)|\bexercise|\bpractice",
        ),
        (
            "Labs",
            r"(?i)\blab(?:oratory|sheet|\b|[_ -]|\d)|\bexperiment",
        ),
        (
            "Lectures",
            r"(?i)lecture|(?:^|[ _.-])lec(?:\b|[_ -]|\d)|\bslides\b",
        ),
        (
            "Readings",
            r"(?i)\breading|\breference|\btextbook|\barticle|\bsupplementary",
        ),
    ];
    for text in [name, relative] {
        for (kind, pattern) in &rules {
            if Regex::new(pattern).unwrap().is_match(text) {
                return kind;
            }
        }
    }
    "Unsorted"
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recognizes_material_types_and_keeps_uncertain_files_unsorted() {
        for (name, kind) in [
            ("154750-Lecture1.pdf", "Lectures"),
            ("Lec_03.pdf", "Lectures"),
            ("Course_Lec03.pdf", "Lectures"),
            ("Course_Tut02.pdf", "Tutorials"),
            ("AMA2111Homework1.pdf", "Assignments"),
            ("Tutorial4_sol.pdf", "Tutorials"),
            ("Tut02.pdf", "Tutorials"),
            ("Assignment1-Sol.pdf", "Assignments"),
            ("AMA3820Midterm.pdf", "Exams"),
            ("Course_Syllabus.pdf", "Overview"),
            ("Lab_02.pdf", "Labs"),
            ("notes.pdf", "Unsorted"),
        ] {
            assert_eq!(infer_type(name, name), kind, "{}", name);
        }
        assert_eq!(
            infer_type("notes.pdf", "Course/Week 2 Lectures/notes.pdf"),
            "Lectures"
        );
        assert_eq!(
            infer_type("lecture-7.md", "Course/Pages/lecture-7.md"),
            "Pages"
        );
        assert_eq!(normalize_category("讲义"), "Lectures");
    }
}

#[cfg(test)]
mod migration_tests {
    use crate::core::Core;
    use serde_json::json;
    #[test]
    fn upgrade_preserves_identity_user_content_and_manual_categories() {
        let root =
            std::env::temp_dir().join(format!("better-canvas-upgrade-{}", uuid::Uuid::new_v4()));
        let data = root.join("data");
        let library = root.join("library");
        {
            let core = Core::new(data.clone(), library.clone()).unwrap();
            let mut ws = core.workspace().unwrap();
            ws["name"] = json!("Student 的工作区");
            ws["connected"] = json!(true);
            core.put("workspace", &ws).unwrap();
            core.put(
                "file",
                &json!({"id":"stable-file","workspace":"local","category":"讲义","demo":false}),
            )
            .unwrap();
            core.put("task",&json!({"id":"stable-task","workspace":"local","title":"我的笔记","completed":false,"source":{"filename":"Canvas 作业","method":"本地规则"}})).unwrap();
        }
        let core = Core::new(data, library).unwrap();
        assert_eq!(core.workspace().unwrap()["name"], "Student's workspace");
        assert_eq!(core.workspace().unwrap()["connected"], true);
        assert_eq!(
            core.get("file", "stable-file").unwrap().unwrap()["category"],
            "Lectures"
        );
        assert_eq!(
            core.get("task", "stable-task").unwrap().unwrap()["title"],
            "我的笔记"
        );
        let task = core.get("task", "stable-task").unwrap().unwrap();
        assert_eq!(task["source"]["filename"], "Canvas assignment");
        assert_eq!(task["source"]["method"], "Local rules");
        drop(core);
        std::fs::remove_dir_all(root).unwrap();
    }
}
