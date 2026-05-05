// tests/utils/seed/AssessmentSeedHelper.js
/**
 * Seed хелпер для создания стандартной анкеты PR.
 *
 * Один раз за прогон создаёт анкету со шкалами (привязанными к компетенциям)
 * и вопросом singleSelect. Название сохраняется в файл
 * `test-results/.seed-assessment-name` — его читает
 * PerformanceReviewConfigPage.addAssessmentsForAllDirections().
 *
 * Если анкета с паттерном уже существует — переиспользует.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "crypto";
import { CompetenciesAPI } from "../api/CompetenciesAPI.js";
import { AssessmentsAPI } from "../api/AssessmentsAPI.js";
import { getCredentials } from "../api/index.js";

const ASSESSMENT_PATTERN = "E2E_Standard_Assessment";
const SEED_FILE = path.resolve("test-results/.seed-assessment-name");

export class AssessmentSeedHelper {
  constructor(request) {
    this.request = request;
    this.competenciesAPI = null;
    this.assessmentsAPI = null;
  }

  /** Авторизация API-клиентов */
  async init() {
    const { email, password } = getCredentials("admin");

    this.assessmentsAPI = new AssessmentsAPI(this.request);
    await this.assessmentsAPI.signIn(email, password, { timeout: 90_000 });

    const token = this.assessmentsAPI.token;
    this.competenciesAPI = new CompetenciesAPI(this.request, token);

    return this;
  }

  /** Проверяет, существует ли уже анкета с нашим паттерном */
  async checkExistingData() {
    try {
      const { data } = await this.assessmentsAPI.getAssessments({
        q: ASSESSMENT_PATTERN,
        limit: 50,
      });
      const items = data?.items || [];
      const existing = items.find(
        (a) => a.questionnaire?.title === ASSESSMENT_PATTERN,
      );
      if (existing) {
        return { hasData: true, assessmentName: ASSESSMENT_PATTERN, assessmentId: existing.id };
      }
    } catch (e) {
      console.warn(`[AssessmentSeed] Ошибка поиска анкеты: ${e.message}`);
    }
    return { hasData: false };
  }

  /**
   * Создать группы компетенций и компетенции (если ещё нет),
   * затем создать анкету со шкальными вопросами + singleSelect.
   */
  async seedAssessment() {
    // 1. Компетенции — переиспользуем _Test компетенции CalibrationSeed
    const competencies = await this._ensureCompetencies();

    // 2. Анкета
    const assessmentId = await this._ensureAssessment(competencies);

    // 3. Сохраняем название в файл для воркеров
    await this._saveAssessmentName();

    return { assessmentId, assessmentName: ASSESSMENT_PATTERN };
  }

  // ─── internal ──────────────────────────────────────────────

  async _ensureCompetencies() {
    // Ищем уже созданные _Test компетенции
    const { data: compsData } =
      await this.competenciesAPI.getCompetencies({ limit: 500 });
    const allComps =
      compsData?.items || (Array.isArray(compsData) ? compsData : []);
    const testComps = allComps.filter((c) => c.title?.endsWith("_Test"));

    if (testComps.length >= 3) {
      console.log(
        `[AssessmentSeed] Найдено ${testComps.length} _Test компетенций, переиспользуем`,
      );
      return testComps.slice(0, 6);
    }

    // Создаём группы
    const groups = await this._createCompetenceGroups();

    // Создаём компетенции
    const competenciesData = [
      { title: "Планирование_Test", description: "Умение планировать задачи", groupId: groups[0]?.id },
      { title: "Качество работы_Test", description: "Внимание к деталям", groupId: groups[0]?.id },
      { title: "Результативность_Test", description: "Достижение целей", groupId: groups[0]?.id },
      { title: "Коммуникация_Test", description: "Взаимодействие с коллегами", groupId: groups[1]?.id },
      { title: "Командная работа_Test", description: "Работа в команде", groupId: groups[1]?.id },
      { title: "Лидерство_Test", description: "Лидерские качества", groupId: groups[1]?.id },
    ];

    const created = [];
    for (const comp of competenciesData) {
      // Проверяем, может уже есть
      const existing = allComps.find((c) => c.title === comp.title);
      if (existing) {
        created.push(existing);
        continue;
      }
      try {
        const { response, data } =
          await this.competenciesAPI.createCompetency(comp);
        if (response.ok()) {
          created.push(data);
          console.log(`[AssessmentSeed] Компетенция "${comp.title}" создана (ID: ${data.id})`);
        }
      } catch (e) {
        console.warn(`[AssessmentSeed] Ошибка создания компетенции "${comp.title}": ${e.message}`);
      }
    }

    return created;
  }

  async _createCompetenceGroups() {
    const groupNames = [
      "Профессиональные навыки_Test",
      "Soft Skills_Test",
    ];

    const { data: existingData } =
      await this.competenciesAPI.getCompetenceGroups({ limit: 500 });
    const existing =
      existingData?.items || (Array.isArray(existingData) ? existingData : []);

    const groups = [];
    for (const title of groupNames) {
      const found = existing.find((g) => g.title === title);
      if (found) {
        groups.push(found);
        continue;
      }
      try {
        const { response, data } =
          await this.competenciesAPI.createCompetenceGroup(title);
        if (response.ok()) {
          groups.push(data);
          console.log(`[AssessmentSeed] Группа "${title}" создана (ID: ${data.id})`);
        }
      } catch (e) {
        console.warn(`[AssessmentSeed] Ошибка создания группы "${title}": ${e.message}`);
      }
    }

    return groups;
  }

  async _ensureAssessment(competencies) {
    // Проверяем, есть ли уже
    const { hasData, assessmentId: existingId } = await this.checkExistingData();
    if (hasData) {
      console.log(`[AssessmentSeed] Анкета "${ASSESSMENT_PATTERN}" уже существует (ID: ${existingId})`);
      return existingId;
    }

    // Создаём новую
    const { response: createResp, data: assessment } =
      await this.assessmentsAPI.createAssessment();

    if (!createResp.ok()) {
      const errorText = await createResp.text();
      throw new Error(`[AssessmentSeed] Не удалось создать анкету: ${errorText}`);
    }

    const assessmentId = assessment.id;
    const now = Date.now();
    const pageId = randomUUID();

    // Шкальные вопросы привязанные к компетенциям
    const scaleQuestions = competencies.map((comp, index) => ({
      temporaryId: randomUUID(),
      type: "scale",
      title: `Оцените ${comp.title.replace(/_Test$/, "").toLowerCase()} сотрудника`,
      description: null,
      isRequired: true,
      allowComment: false,
      allowSkip: false,
      allowCustom: false,
      disallowStepNumbers: false,
      competenceId: comp.id,
      competenceIndicatorQuestionId: null,
      widget: "slider",
      rangeMin: 1,
      rangeMax: 5,
      rangeMinLabel: "Низко",
      rangeMaxLabel: "Высоко",
      position: index + 1,
      commentHeader: null,
      isCommentRequired: false,
      commentRequiredFrom: null,
      commentRequiredTo: null,
      universalTitle: null,
      selectionLimit: null,
      updatedAnswerOptions: [],
      updatedRedirects: [],
      updatedStepLabels: [
        { temporaryId: randomUUID(), text: "Значительно ниже ожиданий", position: 1 },
        { temporaryId: randomUUID(), text: "Ниже ожиданий", position: 2 },
        { temporaryId: randomUUID(), text: "Соответствует ожиданиям", position: 3 },
        { temporaryId: randomUUID(), text: "Выше ожиданий", position: 4 },
        { temporaryId: randomUUID(), text: "Значительно выше ожиданий", position: 5 },
      ],
    }));

    // Вопрос singleSelect (выбор 1 из списка)
    const singleSelectQuestion = {
      temporaryId: randomUUID(),
      type: "singleSelect",
      title: "Как бы вы оценили потенциал роста сотрудника?",
      description: "",
      isRequired: true,
      allowComment: false,
      allowSkip: false,
      allowCustom: false,
      disallowStepNumbers: false,
      position: scaleQuestions.length + 1,
      lastChangeTime: now,
      updatedAnswerOptions: [
        { temporaryId: randomUUID(), text: "Высокий потенциал", position: 1, lastChangeTime: now },
        { temporaryId: randomUUID(), text: "Средний потенциал", position: 2, lastChangeTime: now },
        { temporaryId: randomUUID(), text: "Низкий потенциал", position: 3, lastChangeTime: now },
      ],
      updatedRedirects: [],
      updatedStepLabels: [],
    };

    const updatedQuestions = [...scaleQuestions, singleSelectQuestion];

    const assessmentData = {
      title: ASSESSMENT_PATTERN,
      description: "Стандартная анкета для E2E тестов Performance Review",
      theme: {
        id: 1,
        type: "color",
        mediaId: 1,
        media: { id: 1, color: "#8dd8bf" },
      },
      themeSettings: {},
      updatedPages: [
        {
          temporaryId: pageId,
          title: "Оценка компетенций",
          description: "",
          position: 1,
          updatedQuestions,
        },
      ],
      updatedArchivedQuestions: [],
    };

    const { response: updateResp } =
      await this.assessmentsAPI.updateAssessment(assessmentId, assessmentData);

    if (updateResp.ok()) {
      console.log(
        `[AssessmentSeed] Анкета "${ASSESSMENT_PATTERN}" создана (ID: ${assessmentId}, вопросов: ${updatedQuestions.length})`,
      );
    } else {
      const errorText = await updateResp.text();
      throw new Error(`[AssessmentSeed] Ошибка обновления анкеты: ${updateResp.status()} - ${errorText}`);
    }

    return assessmentId;
  }

  async _saveAssessmentName() {
    try {
      await fs.mkdir(path.dirname(SEED_FILE), { recursive: true });
      await fs.writeFile(SEED_FILE, ASSESSMENT_PATTERN, "utf-8");
      console.log(`[AssessmentSeed] Название сохранено в ${SEED_FILE}`);
    } catch (e) {
      console.warn(`[AssessmentSeed] Не удалось сохранить файл: ${e.message}`);
    }
  }

  /**
   * Прочитать название анкеты из seed-файла (статический метод для использования из воркеров)
   * @returns {Promise<string|null>}
   */
  static async getSeededAssessmentName() {
    try {
      const name = await fs.readFile(SEED_FILE, "utf-8");
      return name.trim() || null;
    } catch {
      return null;
    }
  }
}
