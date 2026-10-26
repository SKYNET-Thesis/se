import { Ionicons } from '@expo/vector-icons';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  useFonts as useManrope,
} from '@expo-google-fonts/manrope';
import { Newsreader_600SemiBold, useFonts as useNewsreader } from '@expo-google-fonts/newsreader';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { classA, course, people, Role, student, taskGroups, teacher } from '../src/data/mock';
import { colors, radius, type } from '../src/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Screen = 'root' | 'course' | 'lesson' | 'class' | 'student' | 'resource';

const roleLabels: Record<Role, string> = { student: 'Student', teacher: 'Teacher', admin: 'School Admin' };
const roleTabs: Record<Role, { key: string; label: string; icon: IconName }[]> = {
  student: [
    { key: 'home', label: 'Home', icon: 'home-outline' },
    { key: 'learn', label: 'Learn', icon: 'book-outline' },
    { key: 'classes', label: 'Classes', icon: 'people-outline' },
    { key: 'activity', label: 'Activity', icon: 'pulse-outline' },
    { key: 'profile', label: 'Profile', icon: 'person-outline' },
  ],
  teacher: [
    { key: 'home', label: 'Home', icon: 'home-outline' },
    { key: 'classes', label: 'Classes', icon: 'people-outline' },
    { key: 'tasks', label: 'Tasks', icon: 'checkmark-done-outline' },
    { key: 'activity', label: 'Activity', icon: 'pulse-outline' },
    { key: 'profile', label: 'Profile', icon: 'person-outline' },
  ],
  admin: [
    { key: 'home', label: 'Home', icon: 'home-outline' },
    { key: 'people', label: 'People', icon: 'people-outline' },
    { key: 'classes', label: 'Classes', icon: 'albums-outline' },
    { key: 'resources', label: 'Resources', icon: 'hardware-chip-outline' },
    { key: 'profile', label: 'Profile', icon: 'person-outline' },
  ],
};

function Icon({ name, size = 20, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
    </View>
  );
}

function Progress({ value, light = false }: { value: number; light?: boolean }) {
  return (
    <View accessibilityLabel={`${value}% complete`} style={[styles.progressTrack, light && styles.progressTrackLight]}>
      <View style={[styles.progressFill, { width: `${value}%` }]} />
    </View>
  );
}

function Badge({ children, tone = 'positive' }: { children: React.ReactNode; tone?: 'positive' | 'warning' | 'neutral' }) {
  return (
    <View style={[styles.badge, tone === 'warning' && styles.badgeWarning, tone === 'neutral' && styles.badgeNeutral]}>
      <Text style={[styles.badgeText, tone === 'warning' && styles.badgeWarningText]}>{children}</Text>
    </View>
  );
}

function Button({ children, onPress, secondary = false }: { children: React.ReactNode; onPress?: () => void; secondary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, pressed && styles.pressed]}>
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{children}</Text>
      {!secondary && <Icon name="arrow-forward" size={17} color={colors.white} />}
    </Pressable>
  );
}

function Header({ title, eyebrow, onBack }: { title: string; eyebrow?: string; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityLabel="Go back" onPress={onBack} style={styles.backButton}>
          <Icon name="chevron-back" />
        </Pressable>
      ) : (
        <View style={styles.brandMark}><View style={styles.brandJoint} /></View>
      )}
      <View style={styles.headerText}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
      </View>
      <Pressable accessibilityLabel="Notifications" style={styles.iconButton}>
        <Icon name="notifications-outline" />
        <View style={styles.notificationDot} />
      </Pressable>
    </View>
  );
}

function RolePreview({ role, onChange }: { role: Role; onChange: (role: Role) => void }) {
  return (
    <View style={styles.preview}>
      <Text style={styles.previewLabel}>Development Preview</Text>
      <View style={styles.previewOptions}>
        {(Object.keys(roleLabels) as Role[]).map((item) => (
          <Pressable key={item} onPress={() => onChange(item)} style={[styles.previewOption, role === item && styles.previewOptionActive]}>
            <Text style={[styles.previewOptionText, role === item && styles.previewOptionTextActive]}>{roleLabels[item]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function CourseArtwork({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.artwork, compact && styles.artworkCompact]}>
      <Image source={require('../assets/robot-course.jpg')} style={styles.artworkImage} />
      <View style={styles.artworkCoordinate}>
        <View style={styles.axisX} /><View style={styles.axisY} /><View style={styles.axisDot} />
      </View>
      <Text style={styles.artworkIndex}>03</Text>
    </View>
  );
}

function StudentHome({ open }: { open: (screen: Screen) => void }) {
  return (
    <>
      <View style={styles.greeting}>
        <Text style={styles.date}>Thursday, October 22</Text>
        <Text style={styles.display}>Good morning,{`\n`}{student.firstName}</Text>
      </View>
      <Pressable onPress={() => open('course')} style={({ pressed }) => [styles.featureCourse, pressed && styles.pressed]}>
        <CourseArtwork />
        <View style={styles.featureBody}>
          <Text style={styles.featureLabel}>Continue learning</Text>
          <Text style={styles.featureTitle}>{course.title}</Text>
          <Text style={styles.featureNext}>{course.next}</Text>
          <View style={styles.featureProgressRow}>
            <View style={styles.progressGrow}><Progress value={course.progress} light /></View>
            <Text style={styles.featurePercent}>{course.progress}%</Text>
          </View>
          <View style={styles.featureAction}><Text style={styles.featureActionText}>Continue lesson</Text><Icon name="arrow-forward" color={colors.white} /></View>
        </View>
      </Pressable>
      <View style={styles.sectionGap}>
        <SectionTitle>Today</SectionTitle>
        <Pressable style={styles.scheduleRow} onPress={() => open('class')}>
          <View><Text style={styles.time}>09:00</Text><Text style={styles.timeMeta}>45 min</Text></View>
          <View style={styles.scheduleLine} />
          <View style={styles.flex}><Text style={styles.rowTitle}>Robotics Class A</Text><Text style={styles.rowMeta}>Robot Discovery · Room 2</Text></View>
          <Icon name="chevron-forward" color={colors.faint} />
        </Pressable>
      </View>
      <View style={styles.sectionGap}>
        <SectionTitle>Due soon</SectionTitle>
        <InfoRow icon="document-text-outline" title="Robot Motion Exercise" meta="Due tomorrow" trailing="Open" />
      </View>
      <View style={styles.sectionGap}>
        <SectionTitle>Recent</SectionTitle>
        <InfoRow icon="checkmark-circle-outline" title="Coordinate Systems Quiz" meta="Reviewed today" trailing="8 / 10" />
      </View>
    </>
  );
}

function InfoRow({ icon, title, meta, trailing }: { icon: IconName; title: string; meta: string; trailing?: string }) {
  return (
    <View style={styles.infoRow}>
      <Icon name={icon} color={colors.muted} />
      <View style={styles.flex}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowMeta}>{meta}</Text></View>
      {trailing ? <Text style={styles.rowTrailing}>{trailing}</Text> : <Icon name="chevron-forward" color={colors.faint} />}
    </View>
  );
}

function Learn({ open }: { open: (screen: Screen) => void }) {
  return (
    <>
      <Header title="Learn" eyebrow="VISTA Mobile" />
      <View style={styles.pageIntro}><Text style={styles.pageTitle}>Your learning</Text><Text style={styles.pageSubtitle}>Pick up where you left off, or explore the next idea.</Text></View>
      <SectionTitle>Continue learning</SectionTitle>
      <Pressable onPress={() => open('course')} style={styles.learningCard}>
        <CourseArtwork compact />
        <View style={styles.learningCardBody}>
          <Text style={styles.courseTitle}>{course.title}</Text>
          <Text style={styles.body}>{course.summary}</Text>
          <Text style={styles.nextLabel}>Next · {course.next}</Text>
          <Progress value={course.progress} />
          <View style={styles.progressCaption}><Text style={styles.meta}>{course.progress}% complete</Text><Text style={styles.textLink}>Continue</Text></View>
        </View>
      </Pressable>
      <View style={styles.sectionGap}><SectionTitle>My courses</SectionTitle><CourseListRow title="Robot Discovery" meta="5 lessons · In progress" value="42%" /><CourseListRow title="Safe Robot Basics" meta="4 lessons · Completed" value="100%" /></View>
      <View style={styles.sectionGap}><SectionTitle>Explore</SectionTitle><View style={styles.explorePanel}><Text style={styles.exploreIndex}>NEW COURSE</Text><Text style={styles.exploreTitle}>Sensors and the world around us</Text><Text style={styles.body}>See how a robot turns distance, light and touch into useful information.</Text><Text style={styles.textLink}>Preview course</Text></View></View>
    </>
  );
}

function CourseListRow({ title, meta, value }: { title: string; meta: string; value: string }) {
  return <View style={styles.courseListRow}><View style={styles.courseMiniArt}><View style={styles.courseMiniLine} /></View><View style={styles.flex}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowMeta}>{meta}</Text></View><Text style={styles.rowTrailing}>{value}</Text></View>;
}

function CourseDetail({ back, open }: { back: () => void; open: (s: Screen) => void }) {
  return (
    <><Header title="Course" eyebrow="Robot Discovery" onBack={back} /><CourseArtwork />
      <View style={styles.detailIntro}><Text style={styles.detailTitle}>{course.title}</Text><Text style={styles.bodyLarge}>{course.summary}</Text><View style={styles.detailProgress}><Progress value={course.progress} /><Text style={styles.meta}>{course.progress}% complete</Text></View></View>
      <View style={styles.continueBand}><View style={styles.flex}><Text style={styles.featureLabelDark}>Continue</Text><Text style={styles.continueTitle}>{course.next}</Text><Text style={styles.meta}>Lesson 3 · 8 min</Text></View><Pressable onPress={() => open('lesson')} style={styles.roundAction}><Icon name="arrow-forward" color={colors.white} /></Pressable></View>
      <View style={styles.sectionGap}><SectionTitle>Course content</SectionTitle>{course.lessons.map((lesson) => <Pressable key={lesson.number} onPress={() => lesson.state === 'Current' && open('lesson')} style={styles.lessonRow}><Text style={[styles.lessonNumber, lesson.state === 'Current' && styles.lessonNumberCurrent]}>{lesson.number}</Text><View style={styles.flex}><Text style={styles.rowTitle}>{lesson.title}</Text><Text style={styles.rowMeta}>{lesson.duration}</Text></View>{lesson.state === 'Completed' ? <Icon name="checkmark-circle" color={colors.teal} /> : lesson.state === 'Current' ? <Badge>Current</Badge> : <Icon name="lock-closed-outline" size={17} color={colors.faint} />}</Pressable>)}</View>
    </>
  );
}

function Lesson({ back }: { back: () => void }) {
  return (
    <><Header title="Lesson 3" eyebrow="Robot Discovery" onBack={back} /><View style={styles.lessonHero}><Text style={styles.lessonKicker}>8 min · Reading</Text><Text style={styles.detailTitle}>Robot Coordinate Systems</Text><Text style={styles.bodyLarge}>Understand how a robot describes position and movement.</Text></View>
      <View style={styles.mediaArea}><View style={styles.coordinateDiagram}><View style={styles.diagramCircle} /><View style={styles.diagramArm} /><View style={styles.diagramXAxis} /><View style={styles.diagramYAxis} /><Text style={styles.diagramLabelX}>X</Text><Text style={styles.diagramLabelY}>Y</Text></View><Text style={styles.mediaCaption}>A coordinate frame gives every point a shared reference.</Text></View>
      <View style={styles.reading}><Text style={styles.readingTitle}>A shared map for movement</Text><Text style={styles.readingBody}>A robot needs a precise way to describe where an object is and where its arm should move. A coordinate system provides that shared map.</Text><View style={styles.keyIdea}><Text style={styles.keyIdeaLabel}>Key idea</Text><Text style={styles.keyIdeaText}>Position only makes sense when we know the frame it is measured from.</Text></View><Text style={styles.readingBody}>The X, Y and Z axes meet at an origin. Together, they let a program describe a target without relying on words such as “left” or “forward,” which can change with viewpoint.</Text></View>
      <View style={styles.robotLab}><Text style={styles.featureLabelDark}>Robot Lab</Text><Text style={styles.continueTitle}>Try it in the interactive workspace</Text><Text style={styles.body}>Programming, 3D simulation and robot execution remain in the controlled VISTA Web workflow.</Text><View style={styles.labFeatures}><Text style={styles.labFeature}>Programming</Text><Text style={styles.labFeature}>3D simulation</Text><Text style={styles.labFeature}>Robot execution</Text></View><Button secondary>Continue on VISTA Web</Button></View>
      <View style={styles.footerAction}><Button>Mark complete</Button></View>
    </>
  );
}

function StudentClasses({ open }: { open: (s: Screen) => void }) {
  return <><Header title="Classes" eyebrow="Student" /><View style={styles.pageIntro}><Text style={styles.pageTitle}>Your classroom</Text><Text style={styles.pageSubtitle}>Sessions, learning and assignments in one place.</Text></View><Pressable onPress={() => open('class')} style={styles.classFeature}><Text style={styles.classCode}>{classA.code}</Text><Text style={styles.classTitle}>{classA.name}</Text><Text style={styles.body}>{course.title}</Text><View style={styles.rule} /><KeyValue label="Instructor" value={teacher.name} /><KeyValue label="Next session" value="Friday · 09:00" /><KeyValue label="Progress" value="42%" /><Progress value={42} /></Pressable></>;
}

function Timeline() {
  const items = [
    ['Today', 'Assignment reviewed', 'Coordinate Systems Quiz · 8 / 10'],
    ['Yesterday', 'Lesson completed', 'Robot Motion Basics'],
    ['Monday', 'New classroom activity', 'Robot Lab 01'],
  ];
  return <><Header title="Activity" eyebrow="Student" /><View style={styles.pageIntro}><Text style={styles.pageTitle}>Learning activity</Text><Text style={styles.pageSubtitle}>Your latest progress across VISTA.</Text></View><View style={styles.timeline}>{items.map(([date, title, meta], i) => <View key={date} style={styles.timelineItem}><View style={styles.timelineRail}><View style={[styles.timelineDot, i === 0 && styles.timelineDotActive]} />{i < items.length - 1 && <View style={styles.timelineStem} />}</View><View style={styles.timelineContent}><Text style={styles.timelineDate}>{date}</Text><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowMeta}>{meta}</Text></View></View>)}</View></>;
}

function TeacherHome({ open }: { open: (s: Screen) => void }) {
  return <><View style={styles.greeting}><Text style={styles.date}>Thursday, October 22</Text><Text style={styles.display}>Good morning,{`\n`}Instructor</Text></View><SectionTitle>Today</SectionTitle><Pressable onPress={() => open('class')} style={styles.teacherSchedule}><View style={styles.teacherTime}><Text style={styles.time}>09:00</Text><Text style={styles.timeMeta}>45 min</Text></View><View style={styles.flex}><Text style={styles.classTitleSmall}>Robotics Class A</Text><Text style={styles.rowMeta}>24 students · Room 2</Text></View><Icon name="arrow-forward" color={colors.teal} /></Pressable><View style={styles.teacherSchedule}><View style={styles.teacherTime}><Text style={styles.time}>13:30</Text><Text style={styles.timeMeta}>60 min</Text></View><View style={styles.flex}><Text style={styles.classTitleSmall}>Robot Lab Session</Text><Text style={styles.rowMeta}>Small group · Lab</Text></View></View><View style={styles.sectionGap}><SectionTitle>Needs attention</SectionTitle><View style={styles.attentionStrip}><View style={styles.attentionCell}><Text style={styles.attentionNumber}>5</Text><Text style={styles.body}>Submissions to review</Text><Text style={styles.textLink}>Review tasks</Text></View><View style={styles.attentionDivider} /><View style={styles.attentionCell}><Text style={styles.attentionNumber}>3</Text><Text style={styles.body}>Students need attention</Text><Text style={styles.textLink}>View students</Text></View></View></View><View style={styles.sectionGap}><SectionTitle>Recent activity</SectionTitle><PersonActivity initials="NB" title="Nguyen Bao Ngoc" meta="Completed Robot Motion Basics" /><PersonActivity initials="TM" title="Tran Minh Anh" meta="Submitted Coordinate Systems Quiz" /></View></>;
}

function PersonActivity({ initials, title, meta }: { initials: string; title: string; meta: string }) {
  return <View style={styles.infoRow}><View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View><View style={styles.flex}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowMeta}>{meta}</Text></View><Text style={styles.timeMeta}>Today</Text></View>;
}

function TeacherClasses({ open }: { open: (s: Screen) => void }) {
  return <><Header title="Classes" eyebrow="Instructor" /><View style={styles.pageIntro}><Text style={styles.pageTitle}>Teaching today</Text><Text style={styles.pageSubtitle}>Open a class to check students, learning and robot allocation.</Text></View><Pressable onPress={() => open('class')} style={styles.classFeature}><Text style={styles.classCode}>{classA.code}</Text><Text style={styles.classTitle}>{classA.name}</Text><Text style={styles.body}>{course.title}</Text><View style={styles.classFacts}><Text style={styles.classFact}><Text style={styles.numInline}>24</Text>{'\n'}students</Text><Text style={styles.classFact}><Text style={styles.numInline}>1</Text>{'\n'}robot resource</Text></View><KeyValue label="Next" value="Today · 09:00" /><Button>Open class</Button></Pressable></>;
}

function TeacherClass({ back, open }: { back: () => void; open: (s: Screen) => void }) {
  const [query, setQuery] = useState('');
  const filtered = people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  return <><Header title={classA.name} eyebrow={classA.code} onBack={back} /><View style={styles.classSummary}><Text style={styles.detailTitle}>{course.title}</Text><View style={styles.classSummaryFacts}><Text style={styles.summaryFact}><Text style={styles.summaryNumber}>24</Text>{'\n'}Students</Text><Text style={styles.summaryFact}><Text style={styles.summaryNumber}>42%</Text>{'\n'}Class progress</Text><Text style={styles.summaryFact}><Text style={styles.summaryNumber}>1</Text>{'\n'}Robot</Text></View></View><View style={styles.tabRule}><Text style={styles.tabActive}>Students</Text><Text style={styles.tabText}>Learning</Text><Text style={styles.tabText}>Tasks</Text><Text style={styles.tabText}>Robot</Text></View><Search value={query} onChange={setQuery} placeholder="Search students" /><View style={styles.listHeader}><Text style={styles.sectionTitle}>Student roster</Text><Text style={styles.meta}>{filtered.length} shown</Text></View>{filtered.map((person) => <Pressable key={person.code} onPress={() => open('student')} style={styles.personRow}><View style={styles.avatar}><Text style={styles.avatarText}>{person.initials}</Text></View><View style={styles.flex}><Text style={styles.rowTitle}>{person.name}</Text><Text style={styles.rowMeta}>{person.code} · {person.progress}% progress</Text></View><Badge tone={person.state === 'Active' ? 'positive' : 'warning'}>{person.state}</Badge></Pressable>)}</>;
}

function StudentDetail({ back }: { back: () => void }) {
  return <><Header title="Student" eyebrow={classA.name} onBack={back} /><View style={styles.studentIdentity}><View style={styles.avatarLarge}><Text style={styles.avatarLargeText}>NB</Text></View><Text style={styles.detailTitle}>{student.name}</Text><Text style={styles.body}>{student.grade} · {student.code}</Text><View style={styles.overallProgress}><Text style={styles.overallNumber}>68%</Text><Text style={styles.meta}>Overall progress</Text><Progress value={68} /></View></View><View style={styles.sectionGap}><SectionTitle>Learning</SectionTitle><InfoRow icon="checkmark-circle-outline" title="Robot Motion Basics" meta="Completed" trailing="100%" /><InfoRow icon="navigate-circle-outline" title="Coordinate Systems" meta="In progress" trailing="42%" /></View><View style={styles.sectionGap}><SectionTitle>Tasks</SectionTitle><InfoRow icon="document-text-outline" title="Coordinate Systems Quiz" meta="Reviewed" trailing="8 / 10" /><InfoRow icon="flask-outline" title="Robot Lab 01" meta="Pending" /></View><View style={styles.sectionGap}><SectionTitle>Recent activity</SectionTitle><Text style={styles.readingBody}>Completed Robot Motion Basics yesterday at 15:42.</Text></View></>;
}

function Tasks() {
  return <><Header title="Tasks" eyebrow="Instructor" /><View style={styles.pageIntro}><Text style={styles.pageTitle}>Quick review</Text><Text style={styles.pageSubtitle}>Handle lightweight feedback here. Complex grading remains on VISTA Web.</Text></View><View style={styles.tabRule}><Text style={styles.tabActive}>Needs review</Text><Text style={styles.tabText}>Upcoming</Text><Text style={styles.tabText}>Completed</Text></View>{taskGroups.map((task) => <View key={task.title} style={styles.taskRow}><View style={styles.flex}><Text style={styles.rowTitle}>{task.title}</Text><Text style={styles.rowMeta}>{task.meta}</Text><Text style={task.state === 'Review' ? styles.warningText : styles.meta}>{task.note}</Text></View><Text style={styles.textLink}>{task.state}</Text></View>)}</>;
}

function AdminHome({ open }: { open: (s: Screen) => void }) {
  return <><View style={styles.adminLead}><View style={styles.brandMarkLarge}><View style={styles.brandJoint} /></View><Text style={styles.date}>VISTA Academy</Text><Text style={styles.display}>School operations</Text><Text style={styles.bodyLarge}>A clear view of people, classes and learning resources.</Text></View><SectionTitle>Needs attention</SectionTitle><View style={styles.adminAttention}><View><Text style={styles.attentionNumber}>3 students</Text><Text style={styles.body}>Account setup pending</Text></View><Text style={styles.textLink}>Review</Text></View><View style={styles.sectionGap}><SectionTitle>Classes</SectionTitle><Pressable onPress={() => open('class')} style={styles.adminClassRow}><View style={styles.flex}><Text style={styles.rowTitle}>{classA.name}</Text><Text style={styles.rowMeta}>24 students · 1 teacher · 1 robot</Text></View><Icon name="chevron-forward" color={colors.faint} /></Pressable></View><View style={styles.sectionGap}><SectionTitle>Resources</SectionTitle><Pressable onPress={() => open('resource')}><RobotResourceCard compact /></Pressable></View><View style={styles.sectionGap}><SectionTitle>Recent activity</SectionTitle><InfoRow icon="person-add-outline" title="Student added to classroom" meta="Today · 08:24" /><InfoRow icon="hardware-chip-outline" title="Robot allocated" meta="Yesterday · Robotics Class A" /></View></>;
}

function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <View style={styles.search}><Icon name="search-outline" color={colors.faint} /><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.faint} style={styles.searchInput} /></View>;
}

function People() {
  const [query, setQuery] = useState('');
  const filtered = people.filter((p) => `${p.name} ${p.code}`.toLowerCase().includes(query.toLowerCase()));
  return <><Header title="People" eyebrow="VISTA Academy" /><View style={styles.tabRule}><Text style={styles.tabActive}>Students</Text><Text style={styles.tabText}>Teachers</Text></View><Search value={query} onChange={setQuery} placeholder="Search people" />{filtered.map((person) => <View key={person.code} style={styles.personRow}><View style={styles.avatar}><Text style={styles.avatarText}>{person.initials}</Text></View><View style={styles.flex}><Text style={styles.rowTitle}>{person.name}</Text><Text style={styles.rowMeta}>{person.code} · {person.detail}</Text></View><Badge tone={person.state === 'Active' ? 'positive' : 'warning'}>{person.state}</Badge></View>)}<View style={styles.webNotice}><Icon name="desktop-outline" color={colors.muted} /><View style={styles.flex}><Text style={styles.rowTitle}>Bulk user management</Text><Text style={styles.rowMeta}>Imports and large account changes are available on VISTA Web.</Text></View></View></>;
}

function AdminClass({ back, open }: { back: () => void; open: (s: Screen) => void }) {
  return <><Header title={classA.name} eyebrow={classA.code} onBack={back} /><View style={styles.classSummary}><Text style={styles.detailTitle}>{course.title}</Text><View style={styles.classSummaryFacts}><Text style={styles.summaryFact}><Text style={styles.summaryNumber}>24</Text>{'\n'}Students</Text><Text style={styles.summaryFact}><Text style={styles.summaryNumber}>1</Text>{'\n'}Teaching staff</Text><Text style={styles.summaryFact}><Text style={styles.summaryNumber}>1</Text>{'\n'}Robot</Text></View></View><View style={styles.sectionGap}><SectionTitle>Members</SectionTitle>{people.slice(0, 3).map((p) => <PersonActivity key={p.code} initials={p.initials} title={p.name} meta={`${p.detail} · ${p.code}`} />)}<PersonActivity initials="VI" title={teacher.name} meta="Teaching staff · Instructor" /></View><View style={styles.sectionGap}><SectionTitle>Robot resource</SectionTitle><Pressable onPress={() => open('resource')}><RobotResourceCard compact /></Pressable></View></>;
}

function RobotResourceCard({ compact = false }: { compact?: boolean }) {
  return <View style={[styles.robotCard, compact && styles.robotCardCompact]}><View style={styles.robotCardTop}><View><Text style={styles.featureLabelDark}>Robot resource</Text><Text style={styles.robotName}>{classA.resource}</Text></View><View style={styles.robotGlyph}><View style={styles.robotGlyphArm} /><View style={styles.robotGlyphJoint} /></View></View><Text style={styles.robotModel}>{classA.model}</Text><View style={styles.rule} /><KeyValue label="Serial" value={classA.serial} /><KeyValue label="Allocated to" value={classA.name} /><Badge>Allocated</Badge></View>;
}

function ResourceDetail({ back }: { back: () => void }) {
  return <><Header title="Robot resource" eyebrow="VISTA Academy" onBack={back} /><View style={styles.resourceHero}><View style={styles.robotGlyphLarge}><View style={styles.robotGlyphArmLarge} /><View style={styles.robotGlyphJointLarge} /></View><Text style={styles.detailTitle}>{classA.resource}</Text><Text style={styles.robotModel}>{classA.model}</Text></View><View style={styles.detailList}><KeyValue label="Status" value="Allocated" /><KeyValue label="Serial" value={classA.serial} /><KeyValue label="Allocation" value={classA.name} /><KeyValue label="Classroom" value="Room 2" /></View><View style={styles.webNotice}><Icon name="shield-checkmark-outline" color={colors.muted} /><View style={styles.flex}><Text style={styles.rowTitle}>Learning resource, not remote control</Text><Text style={styles.rowMeta}>Robot execution is only available through controlled VISTA Web and robot workflows.</Text></View></View></>;
}

function Resources({ open }: { open: (s: Screen) => void }) {
  return <><Header title="Resources" eyebrow="VISTA Academy" /><View style={styles.pageIntro}><Text style={styles.pageTitle}>Robot resources</Text><Text style={styles.pageSubtitle}>Inspect classroom allocation without exposing runtime controls.</Text></View><Pressable onPress={() => open('resource')}><RobotResourceCard /></Pressable></>;
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return <View style={styles.keyValue}><Text style={styles.meta}>{label}</Text><Text numberOfLines={2} style={styles.keyValueText}>{value}</Text></View>;
}

function Profile({ role }: { role: Role }) {
  const isStudent = role === 'student';
  const name = isStudent ? student.name : role === 'teacher' ? teacher.name : 'VISTA Academy Admin';
  return <><Header title="Profile" eyebrow={roleLabels[role]} /><View style={styles.profileIdentity}><View style={styles.avatarLarge}><Text style={styles.avatarLargeText}>{isStudent ? 'NB' : role === 'teacher' ? 'VI' : 'VA'}</Text></View><Text style={styles.detailTitle}>{name}</Text><Text style={styles.body}>{roleLabels[role]} · VISTA Academy</Text></View><View style={styles.settingsList}>{[['person-circle-outline','Account'],['notifications-outline','Notifications'],['contrast-outline','Appearance'],['shield-checkmark-outline','Security'],['help-circle-outline','Help']].map(([icon,label]) => <View key={label} style={styles.settingRow}><Icon name={icon as IconName} color={colors.muted} /><Text style={[styles.rowTitle, styles.flex]}>{label}</Text><Icon name="chevron-forward" color={colors.faint} /></View>)}</View><Pressable style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></Pressable></>;
}

export default function Index() {
  const [manropeLoaded] = useManrope({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold });
  const [newsreaderLoaded] = useNewsreader({ Newsreader_600SemiBold });
  const preview = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const previewRole = preview?.get('role') as Role | null;
  const previewScreen = preview?.get('screen') as Screen | null;
  const [role, setRole] = useState<Role>(previewRole && roleLabels[previewRole] ? previewRole : 'student');
  const [tab, setTab] = useState(preview?.get('tab') || 'home');
  const [screen, setScreen] = useState<Screen>(previewScreen || 'root');
  const tabs = useMemo(() => roleTabs[role], [role]);

  if (!manropeLoaded || !newsreaderLoaded) return <View style={styles.loading}><ActivityIndicator color={colors.teal} /><Text style={styles.loadingText}>Preparing VISTA Mobile</Text></View>;
  const changeRole = (next: Role) => { setRole(next); setTab('home'); setScreen('root'); };
  const back = () => setScreen('root');
  let content: React.ReactNode;
  if (screen === 'course') content = <CourseDetail back={back} open={setScreen} />;
  else if (screen === 'lesson') content = <Lesson back={() => setScreen('course')} />;
  else if (screen === 'student') content = <StudentDetail back={() => setScreen('class')} />;
  else if (screen === 'resource') content = <ResourceDetail back={back} />;
  else if (screen === 'class') content = role === 'teacher' ? <TeacherClass back={back} open={setScreen} /> : role === 'admin' ? <AdminClass back={back} open={setScreen} /> : <CourseDetail back={back} open={setScreen} />;
  else if (role === 'student') content = tab === 'home' ? <StudentHome open={setScreen} /> : tab === 'learn' ? <Learn open={setScreen} /> : tab === 'classes' ? <StudentClasses open={setScreen} /> : tab === 'activity' ? <Timeline /> : <Profile role={role} />;
  else if (role === 'teacher') content = tab === 'home' ? <TeacherHome open={setScreen} /> : tab === 'classes' ? <TeacherClasses open={setScreen} /> : tab === 'tasks' ? <Tasks /> : tab === 'activity' ? <Timeline /> : <Profile role={role} />;
  else content = tab === 'home' ? <AdminHome open={setScreen} /> : tab === 'people' ? <People /> : tab === 'classes' ? <AdminClass back={back} open={setScreen} /> : tab === 'resources' ? <Resources open={setScreen} /> : <Profile role={role} />;

  return <SafeAreaView style={styles.safe}><RolePreview role={role} onChange={changeRole} /><ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>{content}</ScrollView>{screen === 'root' && <View style={styles.tabBar}>{tabs.map((item) => <Pressable key={item.key} onPress={() => setTab(item.key)} style={styles.tabItem}><Icon name={tab === item.key ? item.icon.replace('-outline', '') as IconName : item.icon} size={21} color={tab === item.key ? colors.teal : colors.faint} /><Text style={[styles.tabLabel, tab === item.key && styles.tabLabelActive]}>{item.label}</Text></Pressable>)}</View>}</SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, width: '100%', overflow: 'hidden', backgroundColor: colors.canvas }, scroll: { flex: 1, width: '100%' }, content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }, flex: { flex: 1, minWidth: 0 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.canvas }, loadingText: { fontFamily: type.medium, color: colors.muted },
  preview: { backgroundColor: colors.black, paddingTop: 8, paddingBottom: 9 }, previewLabel: { color: '#AEB6B2', fontFamily: type.semibold, fontSize: 9, letterSpacing: 0.7, textAlign: 'center', textTransform: 'uppercase', marginBottom: 6 }, previewOptions: { paddingHorizontal: 12, gap: 5, flexDirection: 'row', justifyContent: 'center' }, previewOption: { flex: 1, maxWidth: 110, paddingHorizontal: 7, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 7 }, previewOptionActive: { backgroundColor: '#2A3330' }, previewOptionText: { color: '#AEB6B2', fontFamily: type.medium, fontSize: 11 }, previewOptionTextActive: { color: colors.white },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }, headerText: { flex: 1 }, eyebrow: { fontFamily: type.semibold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7, color: colors.faint, marginBottom: 2 }, headerTitle: { fontFamily: type.semibold, fontSize: 18, color: colors.ink }, brandMark: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.teal, borderWidth: 6, borderColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' }, brandMarkLarge: { width: 46, height: 46, borderRadius: 13, backgroundColor: colors.teal, borderWidth: 8, borderColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }, brandJoint: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white }, iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, notificationDot: { position: 'absolute', right: 9, top: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.teal, borderWidth: 1, borderColor: colors.canvas }, backButton: { width: 40, height: 40, borderWidth: 1, borderColor: colors.line, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  greeting: { marginTop: 8, marginBottom: 26 }, date: { fontFamily: type.semibold, fontSize: 12, color: colors.tealDark, letterSpacing: 0.3, marginBottom: 8 }, display: { fontFamily: type.display, fontSize: 35, lineHeight: 38, letterSpacing: -0.7, color: colors.ink }, pageIntro: { marginBottom: 26 }, pageTitle: { fontFamily: type.display, fontSize: 32, lineHeight: 36, color: colors.ink, marginBottom: 6 }, pageSubtitle: { fontFamily: type.body, fontSize: 15, lineHeight: 22, color: colors.muted, maxWidth: 330 },
  featureCourse: { overflow: 'hidden', backgroundColor: colors.black, borderRadius: radius.feature }, artwork: { height: 196, overflow: 'hidden', backgroundColor: '#D8D6CF', position: 'relative' }, artworkCompact: { height: 148 }, artworkImage: { width: '100%', height: '100%', opacity: 0.88 }, artworkCoordinate: { position: 'absolute', left: 22, bottom: 24, width: 74, height: 52 }, axisX: { position: 'absolute', left: 0, bottom: 9, width: 66, height: 1, backgroundColor: colors.white }, axisY: { position: 'absolute', left: 10, bottom: 0, width: 1, height: 48, backgroundColor: colors.white }, axisDot: { position: 'absolute', left: 7, bottom: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.teal }, artworkIndex: { position: 'absolute', top: 18, right: 20, fontFamily: type.semibold, fontSize: 12, color: colors.white }, featureBody: { padding: 22 }, featureLabel: { fontFamily: type.semibold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#AEB9B5', marginBottom: 10 }, featureLabelDark: { fontFamily: type.semibold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: colors.tealDark, marginBottom: 8 }, featureTitle: { fontFamily: type.semibold, fontSize: 21, color: colors.white, marginBottom: 4 }, featureNext: { fontFamily: type.body, fontSize: 14, color: '#CED4D1' }, featureProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 }, progressGrow: { flex: 1 }, featurePercent: { fontFamily: type.semibold, fontSize: 12, color: colors.white }, featureAction: { height: 46, marginTop: 18, borderTopWidth: 1, borderTopColor: '#343C39', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }, featureActionText: { fontFamily: type.semibold, fontSize: 14, color: colors.white }, pressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' }, progressTrackLight: { backgroundColor: '#48504D' }, progressFill: { height: '100%', backgroundColor: colors.teal, borderRadius: 3 }, sectionGap: { marginTop: 34 }, sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 11 }, sectionTitle: { fontFamily: type.semibold, fontSize: 17, color: colors.ink }, sectionAction: { fontFamily: type.semibold, fontSize: 12, color: colors.teal },
  scheduleRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 13 }, time: { fontFamily: type.semibold, fontSize: 17, fontVariant: ['tabular-nums'], color: colors.ink }, timeMeta: { fontFamily: type.body, fontSize: 11, color: colors.faint, marginTop: 2 }, scheduleLine: { width: 2, height: 42, backgroundColor: colors.teal }, rowTitle: { fontFamily: type.semibold, fontSize: 14, color: colors.ink, marginBottom: 3 }, rowMeta: { fontFamily: type.body, fontSize: 12, lineHeight: 17, color: colors.muted }, rowTrailing: { fontFamily: type.semibold, fontSize: 13, fontVariant: ['tabular-nums'], color: colors.ink }, infoRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, paddingVertical: 10 },
  learningCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.feature, overflow: 'hidden' }, learningCardBody: { padding: 20 }, courseTitle: { fontFamily: type.semibold, fontSize: 20, color: colors.ink, marginBottom: 6 }, body: { fontFamily: type.body, fontSize: 14, lineHeight: 21, color: colors.muted }, bodyLarge: { fontFamily: type.body, fontSize: 16, lineHeight: 24, color: colors.muted }, nextLabel: { fontFamily: type.medium, fontSize: 12, color: colors.ink, marginTop: 16, marginBottom: 11 }, progressCaption: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }, meta: { fontFamily: type.body, fontSize: 12, lineHeight: 17, color: colors.muted }, textLink: { fontFamily: type.semibold, fontSize: 13, color: colors.tealDark }, courseListRow: { flexDirection: 'row', alignItems: 'center', minHeight: 72, gap: 13, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }, courseMiniArt: { width: 48, height: 48, backgroundColor: colors.sage, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, courseMiniLine: { width: 24, height: 2, backgroundColor: colors.teal, transform: [{ rotate: '-35deg' }] }, explorePanel: { backgroundColor: colors.tealSoft, borderRadius: radius.card, padding: 20 }, exploreIndex: { fontFamily: type.semibold, fontSize: 10, letterSpacing: 0.8, color: colors.tealDark, marginBottom: 18 }, exploreTitle: { fontFamily: type.display, fontSize: 24, lineHeight: 28, color: colors.ink, marginBottom: 8 },
  detailIntro: { paddingVertical: 24 }, detailTitle: { fontFamily: type.display, fontSize: 31, lineHeight: 35, letterSpacing: -0.4, color: colors.ink, marginBottom: 8 }, detailProgress: { gap: 8, marginTop: 20 }, continueBand: { backgroundColor: colors.tealSoft, borderRadius: radius.card, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 }, continueTitle: { fontFamily: type.semibold, fontSize: 17, lineHeight: 23, color: colors.ink, marginBottom: 3 }, roundAction: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal }, lessonRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }, lessonNumber: { width: 24, fontFamily: type.medium, fontSize: 12, color: colors.faint, fontVariant: ['tabular-nums'] }, lessonNumberCurrent: { color: colors.teal, fontFamily: type.bold }, badge: { alignSelf: 'flex-start', paddingHorizontal: 8, minHeight: 22, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: colors.tealSoft }, badgeText: { fontFamily: type.semibold, fontSize: 10, color: colors.tealDark }, badgeWarning: { backgroundColor: colors.amberSoft }, badgeWarningText: { color: colors.amberInk }, badgeNeutral: { backgroundColor: colors.lineSoft },
  lessonHero: { paddingTop: 8, paddingBottom: 26 }, lessonKicker: { fontFamily: type.semibold, fontSize: 12, color: colors.tealDark, marginBottom: 11 }, mediaArea: { backgroundColor: '#D9E2DC', marginHorizontal: -20, paddingHorizontal: 20, paddingVertical: 24 }, coordinateDiagram: { height: 210, position: 'relative' }, diagramCircle: { position: 'absolute', width: 96, height: 96, borderRadius: 48, borderWidth: 1, borderColor: '#91A39A', left: '36%', top: 42 }, diagramArm: { position: 'absolute', width: 128, height: 14, backgroundColor: colors.ink, left: '18%', top: 90, transform: [{ rotate: '-24deg' }] }, diagramXAxis: { position: 'absolute', height: 1, backgroundColor: colors.teal, width: '72%', left: '14%', bottom: 30 }, diagramYAxis: { position: 'absolute', width: 1, backgroundColor: colors.teal, height: '78%', left: '50%', bottom: 16 }, diagramLabelX: { position: 'absolute', right: '11%', bottom: 34, fontFamily: type.semibold, color: colors.tealDark }, diagramLabelY: { position: 'absolute', left: '53%', top: 10, fontFamily: type.semibold, color: colors.tealDark }, mediaCaption: { fontFamily: type.medium, fontSize: 12, color: colors.muted }, reading: { paddingVertical: 30 }, readingTitle: { fontFamily: type.display, fontSize: 25, color: colors.ink, marginBottom: 14 }, readingBody: { fontFamily: type.body, fontSize: 16, lineHeight: 27, color: colors.ink, marginBottom: 20 }, keyIdea: { borderLeftWidth: 3, borderLeftColor: colors.teal, paddingLeft: 18, paddingVertical: 8, marginVertical: 8, marginBottom: 26 }, keyIdeaLabel: { fontFamily: type.semibold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: colors.tealDark, marginBottom: 8 }, keyIdeaText: { fontFamily: type.display, fontSize: 22, lineHeight: 29, color: colors.ink }, robotLab: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 22 }, labFeatures: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: 16 }, labFeature: { fontFamily: type.medium, fontSize: 11, color: colors.ink, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 5 }, footerAction: { marginTop: 24 },
  button: { minHeight: 48, borderRadius: radius.control, backgroundColor: colors.teal, paddingHorizontal: 17, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }, buttonText: { fontFamily: type.semibold, fontSize: 14, color: colors.white }, buttonSecondaryText: { color: colors.ink },
  classFeature: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, padding: 20 }, classCode: { fontFamily: type.semibold, fontSize: 10, letterSpacing: 1, color: colors.tealDark, marginBottom: 12 }, classTitle: { fontFamily: type.display, fontSize: 27, color: colors.ink, marginBottom: 4 }, classTitleSmall: { fontFamily: type.semibold, fontSize: 16, color: colors.ink, marginBottom: 3 }, rule: { height: 1, backgroundColor: colors.line, marginVertical: 18 }, keyValue: { flexDirection: 'row', justifyContent: 'space-between', gap: 18, paddingVertical: 7 }, keyValueText: { flex: 1, textAlign: 'right', fontFamily: type.medium, fontSize: 12, lineHeight: 17, color: colors.ink, fontVariant: ['tabular-nums'] }, classFacts: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, marginVertical: 18 }, classFact: { flex: 1, fontFamily: type.body, fontSize: 11, lineHeight: 18, color: colors.muted, paddingVertical: 13 }, numInline: { fontFamily: type.semibold, fontSize: 20, color: colors.ink },
  timeline: { marginTop: 6 }, timelineItem: { flexDirection: 'row', minHeight: 100 }, timelineRail: { width: 28, alignItems: 'center' }, timelineDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.line, marginTop: 5 }, timelineDotActive: { backgroundColor: colors.teal }, timelineStem: { width: 1, flex: 1, backgroundColor: colors.line, marginTop: 5 }, timelineContent: { flex: 1, paddingBottom: 28 }, timelineDate: { fontFamily: type.semibold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7, color: colors.faint, marginBottom: 9 },
  teacherSchedule: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 15, borderBottomWidth: 1, borderBottomColor: colors.line }, teacherTime: { width: 54 }, attentionStrip: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line }, attentionCell: { flex: 1, padding: 17 }, attentionDivider: { width: 1, backgroundColor: colors.line }, attentionNumber: { fontFamily: type.display, fontSize: 24, color: colors.ink, marginBottom: 5 }, avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontFamily: type.semibold, fontSize: 11, color: colors.tealDark },
  classSummary: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, padding: 18, marginBottom: 18 }, classSummaryFacts: { flexDirection: 'row', marginTop: 18, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 15 }, summaryFact: { flex: 1, fontFamily: type.body, fontSize: 10, lineHeight: 17, color: colors.muted }, summaryNumber: { fontFamily: type.semibold, fontSize: 19, color: colors.ink }, tabRule: { flexDirection: 'row', gap: 22, borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: 16 }, tabText: { fontFamily: type.medium, fontSize: 12, color: colors.muted, paddingVertical: 12 }, tabActive: { fontFamily: type.semibold, fontSize: 12, color: colors.ink, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: colors.teal }, search: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.control, marginBottom: 18 }, searchInput: { flex: 1, fontFamily: type.body, fontSize: 14, color: colors.ink }, listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }, personRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }, studentIdentity: { alignItems: 'center', paddingVertical: 16 }, avatarLarge: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center', marginBottom: 15 }, avatarLargeText: { fontFamily: type.semibold, fontSize: 20, color: colors.tealDark }, overallProgress: { width: '100%', marginTop: 24, gap: 8 }, overallNumber: { fontFamily: type.display, fontSize: 30, color: colors.ink }, taskRow: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }, warningText: { fontFamily: type.semibold, fontSize: 11, color: colors.amberInk, marginTop: 5 },
  adminLead: { marginTop: 8, marginBottom: 32 }, adminAttention: { minHeight: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 14 }, adminClassRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line }, webNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, padding: 16, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, marginTop: 26 },
  robotCard: { maxWidth: '100%', overflow: 'hidden', backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, padding: 20 }, robotCardCompact: { padding: 17 }, robotCardTop: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' }, robotName: { fontFamily: type.display, fontSize: 22, lineHeight: 27, color: colors.ink, maxWidth: 250, flexShrink: 1 }, robotModel: { fontFamily: type.semibold, fontSize: 12, letterSpacing: 0.8, color: colors.tealDark, marginTop: 8 }, robotGlyph: { width: 42, height: 42, flexShrink: 0, position: 'relative' }, robotGlyphArm: { position: 'absolute', width: 31, height: 5, borderRadius: 2, backgroundColor: colors.ink, top: 18, left: 4, transform: [{ rotate: '-38deg' }] }, robotGlyphJoint: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: colors.teal, top: 9, right: 4 }, resourceHero: { paddingVertical: 16, alignItems: 'center' }, robotGlyphLarge: { width: 150, height: 118, marginBottom: 12, position: 'relative' }, robotGlyphArmLarge: { position: 'absolute', width: 120, height: 16, backgroundColor: colors.ink, borderRadius: 4, top: 54, left: 12, transform: [{ rotate: '-28deg' }] }, robotGlyphJointLarge: { position: 'absolute', width: 34, height: 34, borderRadius: 17, backgroundColor: colors.teal, top: 17, right: 8, borderWidth: 8, borderColor: colors.tealSoft }, detailList: { marginTop: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 10 },
  profileIdentity: { alignItems: 'center', paddingVertical: 18, marginBottom: 20 }, settingsList: { borderTopWidth: 1, borderTopColor: colors.line }, settingRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: 1, borderBottomColor: colors.line }, signOut: { minHeight: 52, justifyContent: 'center', marginTop: 28 }, signOutText: { fontFamily: type.semibold, color: colors.roseInk, fontSize: 14 },
  tabBar: { flexDirection: 'row', minHeight: 70, paddingTop: 8, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface }, tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 50 }, tabLabel: { fontFamily: type.medium, fontSize: 10, color: colors.faint }, tabLabelActive: { color: colors.tealDark, fontFamily: type.semibold },
});
