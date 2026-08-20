// English.
export default {
  common: {
    notFound: 'Not found',
    deleted: 'Deleted',
    unauthorized: 'Not authorised',
    internalError: 'Internal server error',
    fileTooLarge: 'File is too large. The maximum size is 50MB.',
    fileNotFound: 'File not found',
    never: 'Never',
    unknown: 'Unknown',
    general: 'General',
  },

  auth: {
    usernameRequired: 'Username is required',
    passwordRequired: 'Password is required',
    userExists: 'This user already exists',
    registerFailed: 'Registration failed',
    registered: 'Registration successful',
    invalidCredentials: 'Incorrect username or password',
    tooManyAttempts: 'Too many attempts. Please try again in 15 minutes.',
    accountBlocked: 'Your account has been blocked',
    loginSuccess: 'Signed in successfully',
    logoutSuccess: 'Signed out',
    tokenRefreshed: 'Token refreshed',
    tokenMissing: 'Token not found',
    tokenInvalid: 'Token is invalid',
    tokenExpired: 'Token has expired',
    userNotFound: 'User not found',
  },

  user: {
    profileUpdated: 'Profile updated',
    newPasswordRequired: 'A new password is required',
    passwordTooShort: 'The password must be at least 4 characters long',
    oldPasswordRequired: 'Enter your current password',
    oldPasswordWrong: 'Current password is incorrect',
    passwordUpdated: 'Password updated',
    avatarUpdated: 'Photo updated',
    avatarRequired: 'No photo selected',
    avatarRemoved: 'Photo removed',
  },

  admin: {
    roleRequired: 'Role is required',
    invalidRole: 'Invalid role. Allowed: admin, teacher, student',
    nameRequired: 'Name is required',
    studentRequired: 'No student selected',
    userCreated: 'User created successfully',
    userUpdated: 'User updated successfully',
    userDeleted: 'User deleted successfully',
    cannotDeleteRootAdmin: 'The root admin cannot be deleted',
    cannotBlockRootAdmin: 'The root admin cannot be blocked',
    cannotChangeRootAdmin: 'The root admin\'s username, role and status cannot be changed',
    cannotDeleteSelf: 'You cannot delete your own account',
    cannotBlockSelf: 'You cannot block your own account',
    userActivated: 'User activated',
    userBlocked: 'User blocked',
    departmentCreated: 'Department created',
    departmentExists: 'A department with this name already exists',
    subjectCreated: 'Subject created',
    subjectUpdated: 'Subject updated',
    subjectDeleted: 'Subject deleted',
    subjectExists: 'A subject with this name or code already exists',
    subjectInUse: 'The subject is in use — delete the assignments and ratings linked to it first',
    groupCreated: 'Group created',
    groupUpdated: 'Group updated',
    groupDeleted: 'Group deleted',
    groupExists: 'A group with this name already exists',
    groupInUse: 'The group could not be deleted — it is still in use',
    studentAddedToGroup: 'Student added to the group',
    studentRemovedFromGroup: 'Student removed from the group',
    titleAndContentRequired: 'Title and text are required',
    invalidNewsTarget: 'Invalid audience. Allowed: all, teacher, student',
    newsCreated: 'News item created',
    newsUpdated: 'News item updated',
    newsDeleted: 'News item deleted',
    settingsSaved: 'Settings saved',
  },

  assignment: {
    invalidDeadline: 'The deadline format is invalid',
    invalidStart: 'The start date format is invalid',
    startAfterDeadline: 'The start date must be before the deadline',
    notStarted: 'This assignment has not opened yet. You can submit after the start date.',
    titleRequired: 'An assignment title is required',
    groupRequired: 'Select at least one group',
    created: 'Assignment created',
    updated: 'Assignment updated',
    deleted: 'Assignment deleted',
    onlyStudents: 'Only students can submit work',
    deadlinePassed: 'The deadline has passed. Work can no longer be submitted.',
    noFile: 'No file attached',
    invalidFileType: 'Unsupported file type. Allowed: {{allowed}}',
    fileTooLarge: 'File is too large. Maximum allowed size: {{mb}} MB',
    attemptsExhausted:
      'You have used all {{max}} attempts for this assignment. Your highest score counts.',
    submitted: 'Work submitted. AI analysis is running in the background.',
    extendPast: 'The new deadline must be a date in the future',
    noStudents: 'No students selected, or they have already submitted',
    deadlineExtended: 'The deadline was reopened for {{count}} student(s)',
  },

  literature: {
    missingData: 'Not enough information',
    bookAdded: 'Book added',
    bookUpdated: 'Book updated',
    bookDeleted: 'Book deleted',
  },

  subject: {
    onlyStudentsRatings: 'Only students can view the academic rating',
    onlyStudentsCalc: 'Only students can recalculate the rating',
    onlyStudentsReport: 'Only students can download the academic report',
  },

  liveSession: {
    titleRequired: 'A live session title is required',
    invalidSchedule: 'The date/time format is invalid',
    cannotStart: 'This session cannot be started — it has ended or was cancelled',
    notLive: 'This session is not live right now',
  },

  // Subject-agnostic on purpose — this fallback grades a networking lab and a
  // coursework paper alike, so it cannot assume either one's report structure.
  sections: {
    requirements: '1. Requirements compliance',
    correctness: '2. Correctness',
    evidence: '3. Evidence of results',
    clarity: '4. Clarity and structure',
  },

  // What a full-marks answer must contain — sent to the grader as the rubric
  // description for each standard criterion. Keys are the internal section ids.
  rubricHints: {
    Requirements:
      'The work covers everything the assignment (or the teacher\'s own conditions) asked for, and matches the topic precisely.',
    Correctness:
      'The solution, code, configuration or calculation presented is technically correct and error-free, using an approach that fits the task.',
    Evidence:
      'The outcome of the work (program output, screenshot, test, calculation) is clearly shown and substantiated — not just claimed, but demonstrated.',
    Clarity:
      'It is clearly explained how and why the work was done this way, and the write-up is coherent and well organised.',
  },

  notify: {
    newAssignmentTitle: 'New assignment: {{title}}',
    newAssignmentMessage: '{{teacher}} has posted a new assignment for «{{course}}»',
    deadlineExtendedTitle: 'Deadline extended: {{title}}',
    deadlineExtendedMessage: 'This assignment has been reopened for you. New deadline: {{deadline}}',
    plagiarismTitle: 'Originality warning: {{title}}',
    plagiarismMessage:
      'Your work «{{title}}» matched previously submitted work by {{percent}}%. {{penalty}} point(s) were deducted from your score as a result.',
    plagiarismWarning:
      'Your work «{{title}}» matched previously submitted work by {{percent}}%. No points were deducted this time, but the work must be your own.',
    liveSessionScheduledTitle: 'Live session scheduled: {{title}}',
    liveSessionScheduledMessage: '{{teacher}} has scheduled a new live session',
    liveSessionLiveTitle: 'Live session started: {{title}}',
    liveSessionLiveMessage: '{{teacher}} has started the session — join now',
  },

  // Originality (anti-plagiarism) check — the block appended to the AI report.
  plagiarism: {
    heading: 'ORIGINALITY CHECK',
    low:
      'This work matched other previously submitted work by {{percent}}%. Similarity at this level '
      + 'usually comes from shared literature and standard definitions.',
    moderate:
      'Note: this work matched other previously submitted work by {{percent}}%. A significant '
      + 'part of the work was not written independently.',
    high:
      'Warning: you have resubmitted previously submitted work — the match is {{percent}}%. '
      + 'The work was assessed as not having been done independently.',
    duplicate:
      'This work is identical to previously submitted work. You have re-uploaded something submitted before.',
    penaltyApplied: '{{penalty}} point(s) were deducted from the score as a result.',
    noPenalty: 'No points were deducted, but do your future work independently.',
    matchedPassages: 'Matching passages:',
    rechecked: 'Originality re-checked',
  },

  // Audit-log lines (admin.txt + activity_log). Rendered in the reader's language.
  log: {
    register: 'New user registered: {{username}} (student)',
    login: 'User signed in as {{role}}',
    logout: 'User signed out',
    createUser: 'User created: {{username}} ({{role}})',
    updateUser: 'User updated: {{username}}',
    updateGroup: 'Group updated: {{name}}',
    deleteGroup: 'Group deleted: {{name}}',
    createSubject: 'Subject created: {{name}}',
    updateSubject: 'Subject updated: {{name}}',
    deleteSubject: 'Subject deleted: {{name}}',
    deleteUser: 'User deleted: {{username}}',
    createAssignment: 'Assignment created: {{title}}',
    updateAssignment: 'Assignment updated: {{title}}',
    submission: 'Work submitted: {{title}}',
    submissionScored: 'Assignment: {{title}}, score: {{score}}',
    newsCreated: 'News item created: {{title}}',
    settingsUpdated: '{{count}} setting(s) updated',
    updateCriteria: 'Criteria for «{{title}}» updated ({{count}})',
    review: 'The score for «{{title}}» was corrected by the teacher: {{score}}',
    extendDeadline: '«{{title}}» was reopened for {{count}} student(s)',
    plagiarism: '{{percent}}% similarity detected in «{{title}}»',
    liveSessionStart: 'Live session started: {{title}}',
    liveSessionEnd: 'Live session ended: {{title}}',
    liveSessionJoin: 'Joined live session: {{title}}',
  },

  criteria: {
    saved: 'Grading criteria saved',
    nameRequired: 'Every criterion must have a name',
  },

  review: {
    saved: 'Score saved',
    invalidScore: 'The score must be between 0 and 100',
  },

  // AI grading output shown to the student.
  ai: {
    sectionEmpty: 'The section is empty. It cannot be graded.',
    tooShort: 'The answer is too short for academic work.',
    basicDescription: 'A basic description is present, but depth and detail are missing.',
    contentNoAnalysis:
      'Content was provided, but detailed automatic analysis is temporarily unavailable. The score was based on formal indicators (length).',
    imageReceived: 'The image file was received. Visual analysis was temporarily replaced by a formal score.',
    almostEmpty: 'The section is almost empty. Cover the topic in more detail.',
    shortSuperficial: 'The answer is too short and superficial. A detailed description is required.',
    noComment: 'No comment given.',
    noFileContext: 'No context was provided from the file.',
    strongSection: 'Strong section: complete and correct.',
    goodSection: 'Good overall, but there is room to improve and add detail.',
    satisfactory: 'Satisfactory: more precision, logic and examples are needed.',
    weakSection: 'Weak section: the content and structure need serious rework.',
    perPointHeader: 'Comments per point:',
    summary:
      'Final score: {{score}}/100. The grade was formed from an analysis of the standard criteria. Strongest sections: {{strongest}}. Needs rework: {{weakest}}.',
    // Used when the teacher has defined their own criteria — the number of sections varies.
    summaryRubric:
      'Final score: {{score}}/100. The grade was awarded against the {{count}} criteria set by the teacher. Strongest: {{strongest}}. Needs rework: {{weakest}}.',
    summaryRubricShort:
      'Final score: {{score}}/100. The grade was awarded against the {{count}} criteria set by the teacher.',
    pros: 'Strengths of the work: the {{strongest}} sections are done well and meet the requirements.',
    growth:
      'Areas for growth: look at the {{weakest}} sections — a lack of detail or length there lowered the final score noticeably.',
    scoreJustification: 'Final score: {{score}}/100. Why {{score}}: it is the average across points 1–9. ',
    techError: 'A technical error occurred during AI analysis. Please try submitting the work again.',
    penaltiesLabel: 'Penalties:',
    strengthsLabel: 'Strengths:',
    improvementsLabel: 'What to improve:',
    evidenceMissing: 'No material supporting this criterion was found in the work.',
    penaltySections: 'Reduced for skipped sections (2+).',
    penaltyCritical: 'Critical reduction: more than 4 sections were skipped.',
    penaltyNoFlowchart: '-10 point penalty for a missing flowchart.',
    penaltyShortFile: 'The submitted file is too short or holds no meaningful text.',
    // Shown when the work turns out not to be writing at all.
    nonsenseSummary:
      'Final score: 0/100. The submitted work contains no meaningful text — it is random characters, repeated filler or placeholder content rather than an answer to the assignment. Nothing here could be graded against the criteria.',
    nonsenseCriterion: 'No meaningful content: there is nothing here to grade against this criterion.',
    nonsenseAdvice:
      'Write the work out properly in your own words and submit it again — a real attempt, however incomplete, is graded on its merits.',
    // Shown when the file format could not be read at all (legacy .doc/.ppt,
    // scanned PDF) and there is no written answer to fall back on.
    unreadableSummary:
      'Final score: 0/100. The submitted file\'s format could not be read (e.g. a legacy .doc/.ppt file, or a scanned PDF), so the work itself could not be checked. This is not a judgement on the quality of the work — it is a technical limitation.',
    unreadableCriterion: 'The file could not be read: this criterion could not be checked.',
    unreadableAdvice:
      'Resubmit the work in a supported format (.pdf, .docx, .pptx, or source code).',
  },

  // Prompts sent to the model — they also fix the language of the AI's answer.
  prompt: {
    evaluateSection: `
        You are a strict university lecturer. Your task is to grade the "{{sectionName}}" section of a coursework project.

        INPUT:
        1. The student's text for the section:
        """{{content}}"""

        2. Context of the whole work (from the file):
        """{{fileCtx}}"""

        GRADING CRITERIA (0-100 points):
        - 0-30 (Unsatisfactory): The text is off-topic, empty of substance or far too short. Plagiarism or waffle.
        - 31-59 (Satisfactory): The topic is touched on, but very superficially.
        - 60-79 (Good): The section is not badly written, but lacks depth, examples or justification.
        - 80-100 (Excellent): A complete, logical, professional answer.

        IMPORTANT: It is better to give a low score to poor work than an undeserved high one. Be as strict a critic as you can.

        Return your answer as JSON ONLY:
        {"score": <integer 0-100>, "feedback": "<a specific comment in English>"}
  `,
    // The student no longer writes a separate answer per section — the grader
    // reads the whole submitted file against the "{{sectionName}}" criterion.
    evaluateSectionFromFile: `
        You are a strict university lecturer. Your task is to check whether the student's submitted
        file contains enough material for the "{{sectionName}}" criterion, and grade it on that basis.

        CRITERION DESCRIPTION:
        """{{description}}"""

        THE STUDENT'S FULL SUBMITTED FILE:
        """{{fileText}}"""

        GRADING CRITERIA (0-100 points):
        - 0-30 (Unsatisfactory): The file has no material for this criterion, or only the barest mention.
        - 31-59 (Satisfactory): Touched on, but very superficially.
        - 60-79 (Good): Well covered, but lacks depth or examples.
        - 80-100 (Excellent): Fully, logically, professionally covered.

        IMPORTANT: If the file has nothing for this criterion, give a low score — do not credit
        material that isn't there. Be as strict a critic as you can.

        Return your answer as JSON ONLY:
        {"score": <integer 0-100>, "feedback": "<a specific comment in English>"}
  `,
    overallFeedback: `
        The student's scores for points (1–9):
        {{scores}}

        Final average score: {{totalScore}}/100

        Produce the report in ENGLISH, strictly in the following format:
        Summary: ...
        Comment 1: ...
        Comment 2: ...
        {{perPointHeader}}
        1) ...
        ... up to 9)
  `,
  },
};
