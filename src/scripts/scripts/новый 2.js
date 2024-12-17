function processProvincesAndBuildings() { 
  var startTime = new Date();
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Централизованное чтение всех необходимых именованных диапазонов
    const data = readAllData(ss);
    
    // Инициализация данных
    const { stateName, stateData, stateMetrics, workersCoefficient, averageSalary, corporateTax } = initializeStateData(data);
    
    // Фильтрация провинций
    const targetProvinces = data.provincesData.filter(province => province && province.owner === stateName);
    const otherProvinces = data.provincesData.filter(province => province && province.owner !== stateName);
    
    // Инициализация журнала событий
    const eventLog = [];
    
    // Обработка провинций, принадлежащих текущему государству
    targetProvinces.forEach(province => {
      processProvince(province, stateName, stateData, stateMetrics, data.buildingTemplatesMap, data.resourceIndexMap, data.resourceStock, data.resourcePrices, averageSalary, corporateTax, eventLog, data.attributesData, data.resourceDemand, data.resourceSupplyTotal);
    });
    
    // Обновление счетчика существования построек
    updateCycleCounts(data.provincesData, stateName);
    
    // Обработка провинций других государств
    processOtherProvinces(otherProvinces, stateName, stateMetrics, eventLog);
    
    // Применение лимитов построек на уровне государства и провинций
    enforceBuildingLimits(data.buildingTemplatesMap, targetProvinces, stateName, eventLog);
    enforceProvinceBuildingLimits(data.buildingTemplatesMap, data.provincesData, stateName, eventLog);
    
    // Применение глобальных лимитов построек
    enforceGlobalBuildingLimits(data.buildingTemplatesMap, data.provincesData, data.buildingTemplatesMap, eventLog, stateName);
    
    // Ограничение атрибутов государства
    enforceStateAttributeLimits(data.attributesData, eventLog);
    
    // Генерация списка допустимых провинций для построек
    const updatedBuildingTemplatesMap = generateBuildableProvinces(data.provincesData, data.buildingTemplatesMap, stateData, stateName, data.attributesData);
    
    // Обновление шаблонов построек с учетом списка допустимых провинций
    updateBuildingTemplatesWithProvinces(data, updatedBuildingTemplatesMap);
    
    // Обновление складов и записей в таблицу
    updateSpreadsheet(data, eventLog, stateMetrics);
    
    // Централизованная запись всех изменений обратно в таблицу
    writeAllData(ss, data, eventLog, stateMetrics);
    
    logResult("processProvincesAndBuildings", "", (new Date() - startTime) / 1000, "Успешно");
  } catch (e) {
    logResult("processProvincesAndBuildings", e.toString(), (new Date() - startTime) / 1000, "Ошибка");
  }
}

// Функция для централизованного чтения всех необходимых именованных диапазонов
function readAllData(ss) {
  const data = {};
  
  // Чтение объединённого именованного диапазона
  const combinedValues = ss.getRangeByName('Переменные_Объединенные').getValues();
  
  // Распределение данных по отдельным переменным
  combinedValues.forEach(row => {
    const key = row[0];
    const value = row[1];
    if (key && value) {
      try {
        data[key] = JSON.parse(value);
      } catch (e) {
        Logger.log(`Ошибка парсинга JSON для ключа "${key}": ${e}`);
        data[key] = {}; // Или другое значение по умолчанию
      }
    }
  });
  
  // Чтение остальных именованных диапазонов как ранее
  data.provincesRaw = ss.getRangeByName('Провинции_ОсновнаяИнформация').getValues();
  data.buildingTemplatesRaw = ss.getRangeByName('Постройки_Шаблоны').getValues();
  data.culturesRaw = ss.getRangeByName('ПеременныеСписки_Культуры').getValues();
  data.religionsRaw = ss.getRangeByName('ПеременныеСписки_Религии').getValues();
  data.racesRaw = ss.getRangeByName('ПеременныеСписки_Расы').getValues();
  data.technologiesRaw = ss.getRangeByName('ПеременныеСписки_Технологии').getValues();
  data.lawsRaw = ss.getRangeByName('ПеременныеСписки_Законы').getValues();
  data.resourcesRaw = ss.getRangeByName('БиржаТоваров_ОсновнаяИнформация').getValues();
  
  // Обработка прочитанных данных
  data.provincesData = data.provincesRaw.map(row => {
    if (row[0]) {
      try {
        return JSON.parse(row[0]);
      } catch (e) {
        Logger.log(`Ошибка парсинга провинции: ${e}`);
        return null;
      }
    } else {
      return null;
    }
  });
  
  data.buildingTemplates = data.buildingTemplatesRaw.map(row => {
    if (row[0]) {
      try {
        return JSON.parse(row[0]);
      } catch (e) {
        Logger.log(`Ошибка парсинга шаблона постройки: ${e}`);
        return null;
      }
    } else {
      return null;
    }
  });
  
  data.buildingTemplatesMap = {};
  data.buildingTemplates.forEach(template => {
    if (template && template.name) {
      data.buildingTemplatesMap[template.name] = template;
    }
  });
  
  data.cultures = readDataFromRaw(data.culturesRaw);
  data.religions = readDataFromRaw(data.religionsRaw);
  data.races = readDataFromRaw(data.racesRaw);
  data.technologies = readStateTechnologiesGeneralFromRaw(data.technologiesRaw);
  data.laws = readStateLawsGeneralFromRaw(data.lawsRaw);
  
  // Изменено: Чтение данных ресурсов с учетом новой структуры JSON
  data.stateName = data.linksJSON ? data.linksJSON.stateName || 'Неизвестно' : 'Неизвестно'; // Добавлено
  data.resourcesData = readResourcesDataFromRaw(data.resourcesRaw, data.stateName); // Изменено
  data.resourceList = data.resourcesData.resourceList;
  data.resourcePrices = data.resourcesData.resourcePrices; // Теперь это объект, ключами являются названия стран
  data.resourceStock = data.resourcesData.resourceStock;   // Аналогично
  data.resourceSupplyTotal = data.resourcesData.resourceSupplyTotal;
  data.resourceDemand = data.resourcesData.resourceDemand;
  data.resourceIndexMap = data.resourcesData.resourceIndexMap;
  
  data.attributesData = data.attributesJSON || {}; // Уже распарсено выше
  
  data.stateMetrics = data.stateMetricsJSON || {
    corporate_tax_income: 0,
    state_buildings_income: 0,
    state_buildings_expenses: 0,
    workers_available: 0,
    workers_occupied: 0,
    workers_required: 0,
    agricultural_land_total: 0,
    agricultural_land_used: 0,
    agricultural_land_free: 0,
    state_buildings_income_foreign: 0,
    state_buildings_expenses_foreign: 0
  };
  
  return data;
}

// Функция для централизованной записи всех изменений обратно в таблицу
// Функция для централизованной записи всех изменений обратно в таблицу
function writeAllData(ss, data, eventLog, stateMetrics) {
  // Подготовка ключей и значений для записи
  const combinedData = [];

  // Определите список ключей, которые вы хотите записывать
  const keysToWrite = ['linksJSON', 'stateModifiersJSON', 'attributesJSON', 'stateMetricsJSON'];
  
  keysToWrite.forEach(key => {
    let value = '';
    if (key === 'stateMetricsJSON') {
      value = JSON.stringify(stateMetrics);
    } else if (key === 'attributesJSON') {
      value = JSON.stringify(data.attributesData);
    } else if (data[key]) {
      value = JSON.stringify(data[key]);
    }
    combinedData.push([key, value]);
  });
  
  // Запись объединённых данных в именованный диапазон
  ss.getRangeByName('Переменные_Объединенные').setValues(combinedData);
  
  // Обновление данных провинций
  const provincesRange = ss.getRangeByName('Провинции_ОсновнаяИнформация');
  const updatedProvincesValues = data.provincesData.map(province => {
    if (province) {
      return [JSON.stringify(province)];
    } else {
      return [''];
    }
  });
  provincesRange.setValues(updatedProvincesValues);
  
  // Обновление шаблонов построек
  const buildingTemplatesRange = ss.getRangeByName('Постройки_Шаблоны');
  const updatedBuildingTemplatesValues = data.buildingTemplatesRaw.map((row, index) => {
    const template = data.buildingTemplates[index];
    if (template) {
      return [JSON.stringify(template)];
    } else {
      return row;
    }
  });
  buildingTemplatesRange.setValues(updatedBuildingTemplatesValues);
  
  // Изменено: Обновление данных склада ресурсов с учетом новой структуры JSON
  const warehouseRange = ss.getRangeByName('БиржаТоваров_ОсновнаяИнформация');
  const updatedWarehouseValues = data.resourcesRaw.map((row, index) => {
    if (data.resourcesRaw[index][0]) {
      const resource = data.resourcesData.resourceList[index];
      const resourceObj = JSON.parse(data.resourcesRaw[index][0]);
      const countryData = resourceObj.countries[data.stateName]; // Изменено
      
      if (countryData) {
        // Обновляем только данные вашей страны
        countryData.price = data.resourcePrices[resource];
        countryData.stock = data.resourceStock[resource];
        countryData.supply = data.resourceSupplyTotal[resource];
        countryData.demand = data.resourceDemand[resource];
        // trade_supply, trade_demand, strategic_stock, trade_incomes, trade_expenses остаются без изменений
        
        return [JSON.stringify(resourceObj)];
      } else {
        return [JSON.stringify(resourceObj)];
      }
    } else {
      return row;
    }
  });
  warehouseRange.setValues(updatedWarehouseValues);
  
  // Запись журналов событий
  if (eventLog.length > 0) {
    const eventLogSheet = ss.getSheetByName('Журнал событий');
    const lastRow = eventLogSheet.getLastRow();
    eventLogSheet.getRange(lastRow + 1, 1, eventLog.length, 2).setValues(eventLog);
  }
}

// Функция для инициализации данных государства.
// Функция для инициализации данных государства.
function initializeStateData(data) {
  let stateName = 'Неизвестно'; // Значение по умолчанию

  if (data.linksJSON) {
    try {
      stateName = data.linksJSON.stateName || 'Неизвестно'; // Извлекаем stateName
    } catch (e) {
      Logger.log(`Ошибка парсинга JSON из 'Переменные_Объединенные.linksJSON': ${e}`);
    }
  }
  
  const stateModifiers = data.stateModifiersJSON || {};

  const workersCoefficient = stateModifiers.workers_coefficient || 0;
  const averageSalary = stateModifiers.average_salary || 0;
  const corporateTax = stateModifiers.corporate_tax || 0;
  const stateStability = stateModifiers.social_stability || 0;

  const stateData = {
    cultures: data.cultures,
    religions: data.religions,
    races: data.races,
    technologies: data.technologies,
    laws: data.laws,
    stability: stateStability,
    ...stateModifiers
  };

  const stateMetrics = data.stateMetrics;
  
  data.stateName = stateName; // Изменено: Сохраняем stateName в data для использования в других функциях
  
  return { stateName, stateData, stateMetrics, workersCoefficient, averageSalary, corporateTax };
}

// Функция для чтения данных ресурсов из предварительно прочитанных данных
// Изменено: Функция для централизованного чтения данных ресурсов с учетом новой структуры
function readResourcesDataFromRaw(resourcesRaw, stateName) {
  const resourceList = [];
  const resourcePrices = {}; // Изменено: Объект с ключами по странам
  const resourceStock = {};   // Изменено: Объект с ключами по странам
  const resourceSupplyTotal = {};
  const resourceDemand = {};
  const resourceIndexMap = {};
  
  resourcesRaw.forEach((row, index) => {
    const resourceJSON = row[0];
    if (resourceJSON) {
      try {
        const resource = JSON.parse(resourceJSON);
        resourceList.push(resource.name);
        
        // Извлечение данных только для вашей страны
        if (resource.countries && resource.countries[stateName]) { // Изменено
          resourcePrices[resource.name] = resource.countries[stateName].price || 0; // Изменено
          resourceStock[resource.name] = resource.countries[stateName].stock || 0;   // Изменено
          // Остальные поля инициализируются отдельно
        } else {
          // Если данных для вашей страны нет, устанавливаем значения по умолчанию
          resourcePrices[resource.name] = 0;
          resourceStock[resource.name] = 0;
        }
        
        resourceSupplyTotal[resource.name] = 0;
        resourceDemand[resource.name] = 0;
        resourceIndexMap[resource.name] = index;
      } catch (e) {
        Logger.log(`Ошибка парсинга JSON для ресурса в строке ${index + 1}: ${e}`);
      }
    }
  });
  
  return {
    resourceList,
    resourcePrices,
    resourceStock,
    resourceSupplyTotal,
    resourceDemand,
    resourceIndexMap
  };
}

// Функция для чтения данных из raw-данных
function readDataFromRaw(rawData) {
  let result = [];
  rawData.forEach(row => {
    row.forEach(cellValue => {
      if (cellValue) {
        let parsedValue;
        try {
          parsedValue = JSON.parse(cellValue);
          if (Array.isArray(parsedValue)) {
            result = result.concat(parsedValue);
          } else {
            result.push(parsedValue);
          }
        } catch (e) {
          // Если не удалось распарсить как JSON, добавляем значение напрямую
          result.push(cellValue);
        }
      }
    });
  });
  return result;
}

// Функция для чтения изученных технологий из raw-данных
function readStateTechnologiesGeneralFromRaw(technologiesRaw) {
  let result = [];
  technologiesRaw.forEach((row, i) => {
    row.forEach((cellValue, j) => {
      if (cellValue) {
        let techObject;
        try {
          techObject = JSON.parse(cellValue);
          if (techObject.status === 'Изучена' && techObject.name) {
            result.push(techObject.name);
          }
        } catch (e) {
          Logger.log(`Ошибка парсинга JSON в ячейке (${i + 1}, ${j + 1}): ${e}`);
        }
      }
    });
  });
  return result;
}

// Функция для чтения принятых законов из raw-данных
function readStateLawsGeneralFromRaw(lawsRaw) {
  let result = [];
  lawsRaw.forEach((row, i) => {
    row.forEach((cellValue, j) => {
      if (cellValue) {
        let lawObject;
        try {
          lawObject = JSON.parse(cellValue);
          if (lawObject.status === 'Принят' && lawObject.name) {
            result.push(lawObject.name);
          }
        } catch (e) {
          Logger.log(`Ошибка парсинга JSON в ячейке (${i + 1}, ${j + 1}): ${e}`);
        }
      }
    });
  });
  return result;
}

// Обнуление государственных атрибутов
function resetStateAttributes(attributesData) {
  const stateAttributesResetMap = {
    'science_points': true,
    'religion_points': false,
    'culture_points': false
    // Добавьте другие атрибуты по необходимости
  };

  for (const attributeKey in stateAttributesResetMap) {
    if (stateAttributesResetMap[attributeKey]) {
      attributesData[attributeKey] = 0;
    }
  }
}

// Обработка одной провинции.
function processProvince(province, stateName, stateData, stateMetrics, buildingTemplatesMap, resourceIndexMap, resourceStock, resourcePrices, averageSalary, corporateTax, eventLog, attributesData, resourceDemand, resourceSupplyTotal) {
  // Локальные переменные и инициализация
  let provinceMessages = [];
  province.available_workers = Math.floor(province.population * stateData.workers_coefficient);
  province.occupied_workers = 0;
  stateMetrics.workers_available += province.available_workers;

  // Агрокультурные земли
  let freeAgriculturalLand = province.agricultural_land || 0;
  let usedAgriculturalLand = 0;
  stateMetrics.agricultural_land_total += province.agricultural_land || 0;

  // Атрибуты провинции
  let provinceAttributes = province.province_attributes || {};
  resetProvinceAttributes(provinceAttributes);

  // Обнуляем доходы и расходы построек
  if (province.buildings && province.buildings.length > 0) {
    province.buildings.forEach(building => {
      resetBuilding(building);
      const buildingTemplate = buildingTemplatesMap[building.name];
      if (!buildingTemplate) {
        building.status = 'Неактивная'; // Устанавливаем статус "Неактивная" для построек без шаблона
        eventLog.push([`Шаблон для постройки "${building.name}" в провинции "${province.province_id}" не найден. Постройка получила статус "Неактивная" и будет снесена через некоторое количество ходов.`, 'Сообщить Администрации']);
        return; // Прерываем обработку этой постройки
      }

      // Применение модификаторов
      const modifiers = applyBuildingModifiers(buildingTemplate);
      const productionEfficiency = modifiers.productionEfficiency;
      const extractionEfficiency = modifiers.extractionEfficiency;
      const consumptionEfficiency = modifiers.consumptionEfficiency;

      // Проверка критериев
      if (!checkBuildingCriteria(buildingTemplate, province, stateData, stateName, building, provinceMessages, attributesData)) return;

      // Проверка и назначение рабочих
      if (!assignWorkers(buildingTemplate, province, stateMetrics, averageSalary, building, provinceMessages)) return;

      // Проверка агрокультурных земель
      const requiredAgriculturalLand = buildingTemplate.required_agricultural_land || 0;
      if (freeAgriculturalLand < requiredAgriculturalLand) {
        building.status = 'Неактивная';
        provinceMessages.push(`Недостаточно агрокультурных земель для постройки "${building.name}" в провинции "${province.province_id}". Необходимо ${requiredAgriculturalLand}, доступно ${freeAgriculturalLand}. Постройка получит статус "Неактивная".`);
        return;
      }
      usedAgriculturalLand += requiredAgriculturalLand;
      freeAgriculturalLand -= requiredAgriculturalLand;

      // Обработка ресурсов
      if (!processBuildingResources(building, buildingTemplate, province, resourceIndexMap, resourceStock, resourcePrices, consumptionEfficiency, provinceMessages, resourceDemand, resourceSupplyTotal)) return;

      // Обработка производства ресурсов
      processResourceProduction(building, buildingTemplate, resourceIndexMap, resourceStock, stateMetrics, resourcePrices, productionEfficiency, resourceDemand, resourceSupplyTotal, province, provinceMessages);

      // Обработка корпоративного налога
      processCorporateTax(building, stateName, corporateTax, stateMetrics);

      // Обработка атрибутов построек
      updateAttributes(building, buildingTemplate, provinceAttributes, attributesData);

      // Обработка resource_extraction
      if (building.status === 'Активная' && buildingTemplate.resource_extraction) {
        processResourceExtraction(building, buildingTemplate, province, resourceIndexMap, resourceStock, resourcePrices, extractionEfficiency, provinceMessages, resourceDemand, resourceSupplyTotal);
      }

      // Обновление метрик
      if (building.building_owner === stateName) {
        stateMetrics.state_buildings_income += building.incomes;
        stateMetrics.state_buildings_expenses += building.expenses;
      }
    });
  }

  // Обработка самоуничтожения построек
  handleSelfDestruction(province, eventLog);

  // Ограничение атрибутов провинции
  enforceProvinceAttributeLimits([province], stateName, eventLog);

  // Обновление агрокультурных земель
  province.agricultural_land_used = usedAgriculturalLand;
  province.agricultural_land_free = freeAgriculturalLand;
  stateMetrics.agricultural_land_used += usedAgriculturalLand;
  stateMetrics.agricultural_land_free += freeAgriculturalLand;

  // Логирование сообщений
  if (provinceMessages.length > 0) {
    eventLog.push([`Провинция "${province.province_id}": ${provinceMessages.join('; ')}`, 'Уведомление']);
  }
}

// Обработка других провинций
function processOtherProvinces(otherProvinces, stateName, stateMetrics, eventLog) {
  otherProvinces.forEach(province => {
    if (!province) return;

    if (province.buildings && province.buildings.length > 0) {
      province.buildings.forEach(building => {
        if (building.building_owner === stateName && building.status === 'Активная') {
          stateMetrics.state_buildings_income_foreign += building.incomes || 0;
          stateMetrics.state_buildings_expenses_foreign += building.expenses || 0;
        }
      });
    }
  });
}

// Обновление данных в таблице и журнале событий.
function updateSpreadsheet(data, eventLog, stateMetrics) {
  // Здесь ничего не делаем, так как запись происходит централизованно в writeAllData
  // Все изменения уже внесены в объект data и будут записаны обратно
}

// Сброс доходов и расходов постройки.
function resetBuilding(building) {
  building.expenses = 0;
  building.incomes = 0;
  building.status = 'Активная';
}

// Проверка соответствия критериев постройки.
function checkBuildingCriteria(buildingTemplate, province, stateData, stateName, building, provinceMessages, attributesData) {
  let allCriteriaMet = true;

  // Проверка критериев провинции
  const provinceCriteriaMet = checkCriteria(buildingTemplate, province, 'province');
  if (!provinceCriteriaMet.success) {
    allCriteriaMet = false;
    const reasons = provinceCriteriaMet.reasons.join('; ');
    provinceMessages.push(`Провинция "${province.province_id}" не подходит для здания "${building.name}". Причины: ${reasons}`);
  }

  // Проверка критериев государства
  const stateCriteriaMet = checkCriteria(buildingTemplate, stateData, 'state');
  if (!stateCriteriaMet.success) {
    allCriteriaMet = false;
    const reasons = stateCriteriaMet.reasons.join('; ');
    provinceMessages.push(`Государство "${stateName}" не подходит для здания "${building.name}". Владелец постройки "${building.building_owner}". Причины: ${reasons}`);
  }

  // Проверка атрибутов постройки
  const attributeCheckResult = checkBuildingAttributeRequirements(buildingTemplate, province, attributesData);
  if (!attributeCheckResult.success) {
    allCriteriaMet = false;
    const reasons = attributeCheckResult.reasons.join('; ');
    provinceMessages.push(`Провинция "${province.province_id}" не соответствует атрибутам для постройки "${building.name}". Причины: ${reasons}`);
  }

  // Проверка зависимостей построек с логическими операторами
  if (buildingTemplate.required_buildings) {
    const existingBuildings = province.buildings.map(b => b.name);
    const dependenciesResult = evaluateBuildingCriteria(buildingTemplate.required_buildings, existingBuildings);

    if (!dependenciesResult.met) {
      allCriteriaMet = false;
      let dependencyMessage = `Постройка "${building.name}" требует: `;
      if (buildingTemplate.required_buildings.AND || buildingTemplate.required_buildings.OR || buildingTemplate.required_buildings.NOT || buildingTemplate.required_buildings.XOR) {
        // Если используются логические операторы, формируем сообщение на основе оператора
        dependencyMessage += formatMissingDependencies(buildingTemplate.required_buildings, dependenciesResult.missing);
      } else {
        // Если простое перечисление
        dependencyMessage += `наличия следующих построек: ${dependenciesResult.missing.join(', ')}`;
      }
      provinceMessages.push(`Провинция "${province.province_id}" не соответствует требованиям по зависимым постройкам для "${building.name}". ${dependencyMessage}`);
    }
  }

  // Устанавливаем статус здания на основе результатов проверок
  building.status = allCriteriaMet ? 'Активная' : 'Неактивная';

  return allCriteriaMet;
}

// Назначение рабочих для постройки.
function assignWorkers(buildingTemplate, province, stateMetrics, averageSalary, building, provinceMessages) {
  const requiredWorkers = buildingTemplate.required_workers || 0;
  const freeWorkers = province.available_workers - province.occupied_workers;
  stateMetrics.workers_required += requiredWorkers;

  if (freeWorkers >= requiredWorkers) {
    province.occupied_workers += requiredWorkers;
    stateMetrics.workers_occupied += requiredWorkers;
    building.expenses += requiredWorkers * averageSalary;
    return true;
  } else {
    building.status = 'Неактивная';
    provinceMessages.push(`Не хватает рабочей силы для постройки "${building.name}" в провинции "${province.province_id}". Необходимо ${requiredWorkers}, доступно ${freeWorkers}. Постройка получит статус "Неактивная".`);
    return false;
  }
}

// Обработка потребления ресурсов зданием.
function processBuildingResources(
  building,
  buildingTemplate,
  province,
  resourceIndexMap,
  resourceStock,
  resourcePrices,
  consumptionEfficiency,
  provinceMessages,
  resourceDemand,
  resourceSupplyTotal
) {
  const consumption = buildingTemplate.consumption || {};
  let consumptionPossible = true;
  let consumptionCost = 0;
  const missingResources = [];

  for (const resource in consumption) {
    const requiredAmount = consumption[resource] * consumptionEfficiency;
    const index = resourceIndexMap[resource];

    if (index === undefined) {
      // Ресурс отсутствует на складе
      consumptionPossible = false;
      missingResources.push(`Тип ресурса "${resource}" не найден на складе.`);
      continue;
    }

    resourceDemand[resource] += requiredAmount;

    if (resourceStock[resource] >= requiredAmount) { // Изменено
      resourceStock[resource] -= requiredAmount;
      consumptionCost += requiredAmount * resourcePrices[resource]; // Изменено
    } else {
      consumptionPossible = false;
      missingResources.push(`${resource}: требуется ${requiredAmount}, доступно ${resourceStock[resource] || 0}`); // Изменено
    }
  }

  if (!consumptionPossible) {
    building.status = 'Неактивная';
    const provinceId = province.province_id || 'Неизвестно';
    const message = `Провинция "${provinceId}": ${missingResources.join('; ')}`;
    provinceMessages.push(message);
    return false;
  } else {
    building.expenses += consumptionCost;
    return true;
  }
}

// Обработка производства ресурсов зданием.
function processResourceProduction(
  building,
  buildingTemplate,
  resourceIndexMap,
  resourceStock,
  stateMetrics,
  resourcePrices,
  productionEfficiency,
  resourceDemand,
  resourceSupplyTotal,
  province,
  provinceMessages
) {
  const production = buildingTemplate.production || {};
  let productionIncome = 0;
  let productionPossible = true;
  const missingResources = [];

  for (const resource in production) {
    const producedAmount = production[resource] * productionEfficiency;
    const index = resourceIndexMap[resource];

    if (index === undefined) {
      // Ресурс отсутствует на складе
      productionPossible = false;
      missingResources.push(`Тип ресурса "${resource}" не найден на складе.`);
      continue; // Пропускаем обработку этого ресурса
    }

    // Добавляем произведенное количество в общий запас и предложение
    resourceSupplyTotal[resource] += producedAmount; // Изменено
    resourceStock[resource] += producedAmount;        // Изменено

    // Рассчитываем доход от производства
    productionIncome += producedAmount * resourcePrices[resource]; // Изменено
  }

  if (!productionPossible) {
    // Устанавливаем статус постройки в "Неактивная"
    building.status = 'Неактивная';

    // Формируем сообщение
    const provinceId = province.province_id || 'Неизвестно';
    const message = missingResources.join('; ');
    provinceMessages.push(message);

    return false; // Прекращаем дальнейшую обработку
  } else {
    // Добавляем доход от производства к постройке
    building.incomes += productionIncome;
    return true;
  }
}

// Обработка корпоративного налога.
function processCorporateTax(building, stateName, corporateTax, stateMetrics) {
  if (building.building_owner !== stateName && building.status === 'Активная') {
    const taxAmount = building.incomes * corporateTax;
    building.expenses += taxAmount;

    stateMetrics.corporate_tax_income += taxAmount;
  }
}

// Обновление атрибутов на основе активных построек.
function updateAttributes(building, buildingTemplate, provinceAttributes, stateAttributes) {
  // Обработка атрибутов активной постройки для провинции
  if (building.status === 'Активная' && buildingTemplate.province_attributes) {
    for (const attributeKey in buildingTemplate.province_attributes) {
      const attributeValue = buildingTemplate.province_attributes[attributeKey];

      // Суммируем атрибуты в provinceAttributes
      if (provinceAttributes.hasOwnProperty(attributeKey)) {
        provinceAttributes[attributeKey] += attributeValue;
      } else {
        provinceAttributes[attributeKey] = attributeValue;
      }
    }
  }

  // Обработка атрибутов активной постройки для государства
  if (building.status === 'Активная' && buildingTemplate.state_attributes) {
    for (const attributeKey in buildingTemplate.state_attributes) {
      const attributeValue = buildingTemplate.state_attributes[attributeKey];

      // Суммируем атрибуты в stateAttributes
      if (stateAttributes.hasOwnProperty(attributeKey)) {
        stateAttributes[attributeKey] += attributeValue;
      } else {
        stateAttributes[attributeKey] = attributeValue;
      }
    }
  }
}

// Обработка самоуничтожения построек.
function handleSelfDestruction(province, eventLog) {
  if (province.buildings && province.buildings.length > 0) {
    // Используем копию массива зданий для безопасного удаления элементов во время итерации
    const buildingsCopy = [...province.buildings];
    buildingsCopy.forEach(building => {
      processSelfDestruction(building, province, eventLog);
    });
  }
}

// Функция обработки добычи ресурсов для активной постройки
// Функция обработки добычи ресурсов для активной постройки
function processResourceExtraction(building, buildingTemplate, province, resourceIndexMap, resourceStock, resourcePrices, extractionEfficiency, provinceMessages, resourceDemand, resourceSupplyTotal) {
  const resourceExtraction = buildingTemplate.resource_extraction;

  // Проверяем, существует ли resource_extraction и не пустой ли он
  if (!resourceExtraction || Object.keys(resourceExtraction).length === 0) {
    return; // Нет ресурсов для добычи, выходим из функции
  }

  const provinceResources = province.resources || [];

  for (const resourceName in resourceExtraction) {
    const baseExtractionAmount = resourceExtraction[resourceName];
    const extractionAmount = baseExtractionAmount * extractionEfficiency;

    // Поиск ресурса в провинции
    const resourceEntryIndex = provinceResources.findIndex(res => res.startsWith(resourceName + ":"));
    if (resourceEntryIndex === -1) {
      // Ресурс не найден
      provinceMessages.push(`Постройка "${building.name}" не находит запасы необходимого ресурса "${resourceName}". Добыча будет остановлена.`);
      continue; // Пропускаем обработку этого ресурса
    }

    // Парсим количество ресурса
    let [resName, resQuantityStr] = provinceResources[resourceEntryIndex].split(":");
    let resQuantity = parseFloat(resQuantityStr) || 0;

    // Проверка достаточности ресурса
    if (resQuantity > extractionAmount) {
      // Достаточно ресурса для извлечения
      provinceResources[resourceEntryIndex] = `${resName}:${resQuantity - extractionAmount}`;
      // Добавляем на склад
      if (resourceIndexMap[resName] !== undefined) { // Изменено
        resourceStock[resName] += extractionAmount; // Изменено
      } else {
        // Ресурс не найден в списке ресурсов склада
        provinceMessages.push(`Тип ресурса "${resName}" не найден в складе.`);
        continue;
      }

      // Добавляем добытые ресурсы в предложение
      resourceSupplyTotal[resName] += extractionAmount; // Изменено

      // Рассчитываем доход от добычи
      const incomeFromExtraction = extractionAmount * resourcePrices[resName]; // Изменено
      building.incomes += incomeFromExtraction;

      // Рассчитываем количество циклов до истощения
      const remainingQuantity = resQuantity - extractionAmount;
      const remainingCycles = extractionAmount > 0 ? Math.floor(remainingQuantity / extractionAmount) : 0;
      if (remainingCycles <= 5) {
        provinceMessages.push(`Постройка "${building.name}" истощает запасы ресурса "${resName}". Добыча будет остановлена через ${remainingCycles} ходов.`);
      }
    } else if (resQuantity > 0 && resQuantity <= extractionAmount) {
      // Остаток ресурса меньше или равен extractionAmount
      // Добавляем остаток на склад
      if (resourceIndexMap[resName] !== undefined) { // Изменено
        resourceStock[resName] += resQuantity; // Изменено
        resourceSupplyTotal[resName] += resQuantity; // Изменено
      } else {
        // Ресурс не найден в списке ресурсов склада
        provinceMessages.push(`Тип ресурса "${resName}" не найден в складе.`);
      }
      // Добавляем доход от добычи остатка
      const incomeFromExtraction = resQuantity * resourcePrices[resName]; // Изменено
      building.incomes += incomeFromExtraction;

      // Удаляем ресурс из провинции
      provinceResources.splice(resourceEntryIndex, 1);
      // Записываем событие
      provinceMessages.push(`Постройка "${building.name}" истощила запасы ресурса "${resName}". Добыча будет остановлена.`);
    } else {
      // Нет ресурса для добычи
      provinceMessages.push(`Постройка "${building.name}" не находит запасы необходимого ресурса "${resName}". Добыча будет остановлена.`);
    }
  }

  // Обновляем ресурсы провинции
  province.resources = provinceResources;
}

// Функция проверки и ограничения значений атрибутов провинций.
function enforceProvinceAttributeLimits(provincesData, stateName, eventLog) {
  // Шаг 1: Определение лимитов атрибутов провинций
  const attributeLimits = {
    "transport_infrastructure": {
      hasLimit: true,
      min: 0,
      max: 100,
      log: false, // Параметр отвечающий за вывод сообщения в журнал событий
      message: 'Провинция "{province_id}": Атрибут "{attribute}" скорректирован с {oldValue} до {newValue} из-за нарушения ограничения.'
    }
    // Добавьте другие атрибуты по необходимости
  };

  // Шаг 2: Проверка и корректировка атрибутов провинций
  provincesData.forEach(province => {
    if (!province || province.owner !== stateName) return; // Пропускаем провинции других стран

    if (!province.province_attributes) {
      province.province_attributes = {};
    }

    let attributesChanged = false;
    let provinceMessages = [];

    for (const attribute in attributeLimits) {
      const limit = attributeLimits[attribute];
      if (!limit.hasLimit) continue;

      if (province.province_attributes.hasOwnProperty(attribute)) {
        let value = province.province_attributes[attribute];
        const { min, max, log, message } = limit;
        let adjusted = false;
        let oldValue = value;
        let newValue = value;

        // Проверка на минимальное значение
        if (min !== null && value < min) {
          newValue = min;
          adjusted = true;
        }

        // Проверка на максимальное значение
        if (max !== null && value > max) {
          newValue = max;
          adjusted = true;
        }

        if (adjusted) {
          province.province_attributes[attribute] = newValue;
          attributesChanged = true;

          if (log && message) {
            const formattedMessage = message
              .replace('{province_id}', province.province_id || 'Неизвестен')
              .replace('{attribute}', attribute)
              .replace('{oldValue}', oldValue)
              .replace('{newValue}', newValue);
            provinceMessages.push(formattedMessage);
          }
        }
      }
    }

    if (attributesChanged && provinceMessages.length > 0) {
      eventLog.push([provinceMessages.join(' '), 'Уведомление']);
    }
  });
}

// Функция проверки и ограничения значений атрибутов государства.
function enforceStateAttributeLimits(attributesData, eventLog) {
  // Шаг 1: Определение лимитов атрибутов государства
  const stateAttributeLimits = {
    "science_points": {
      hasLimit: true,
      min: 0,
      max: 10000,
      log: true, // Параметр отвечающий за вывод сообщения в журнал событий
      message: 'Количество очков науки({attribute}) было изменено с {oldValue} на {newValue} из-за нарушения лимита накопления.'
    },
    "culture_points": {
      hasLimit: true,
      min: 0,
      max: 10000,
      log: true,
      message: 'Количество очков культуры({attribute}) было изменено с {oldValue} на {newValue} из-за нарушения лимита накопления.'
    },
    "religion_points": {
      hasLimit: true,
      min: 0,
      max: 10000,
      log: true,
      message: 'Количество очков религии({attribute}) было изменено с {oldValue} на {newValue} из-за нарушения лимита накопления.'
    }
    // Добавьте другие атрибуты по необходимости
  };

  // Шаг 2: Проверка и корректировка атрибутов государства
  for (const attribute in stateAttributeLimits) {
    const limit = stateAttributeLimits[attribute];
    if (!limit.hasLimit) continue;

    if (attributesData.hasOwnProperty(attribute)) {
      let value = attributesData[attribute];
      const { min, max, log, message } = limit;
      let adjusted = false;
      let oldValue = value;
      let newValue = value;

      // Проверка на минимальное значение
      if (min !== null && value < min) {
        newValue = min;
        adjusted = true;
      }

      // Проверка на максимальное значение
      if (max !== null && value > max) {
        newValue = max;
        adjusted = true;
      }

      if (adjusted) {
        attributesData[attribute] = newValue;

        if (log && message) {
          const formattedMessage = message
            .replace('{attribute}', attribute)
            .replace('{oldValue}', oldValue)
            .replace('{newValue}', newValue);
          eventLog.push([formattedMessage, 'ВНИМАНИЕ']);
        }
      }
    }
  }
}

// Функция проверки и применения лимитов построек.
function enforceBuildingLimits(buildingTemplatesMap, targetProvinces, stateName, eventLog) {
  for (const buildingName in buildingTemplatesMap) {
    const template = buildingTemplatesMap[buildingName];
    if (template.building_limit !== undefined && template.building_limit > 0) {
      const limit = template.building_limit;
      // Собираем все здания данного типа, принадлежащие государству
      let buildingsList = [];

      targetProvinces.forEach((province, provinceIndex) => {
        if (province.buildings) {
          province.buildings.forEach((building, buildingIndex) => {
            if (building.name === buildingName) {
              buildingsList.push({ provinceIndex, buildingIndex, building });
            }
          });
        }
      });

      const currentCount = buildingsList.length;

      if (currentCount > limit) {
        const excess = currentCount - limit;
        for (let i = 0; i < excess; i++) {
          const buildingToRemove = buildingsList.pop(); // Удаляем последние постройки
          const { provinceIndex, buildingIndex, building } = buildingToRemove;
          const province = targetProvinces[provinceIndex];

          if (!province) { // Эта проверка теперь избыточна, но оставлена на случай изменений
            continue;
          }

          // Удаляем постройку из провинции
          province.buildings.splice(buildingIndex, 1);

          // Записываем сообщение в журнал событий
          eventLog.push([
            `Лимит построек типа "${buildingName}" для государства превышен. Постройка удалена из провинции "${province.province_id}".`,
            'ВНИМАНИЕ'
          ]);
        }
      }
    }
  }
}

// Функция проверки и применения лимитов построек для каждой провинции.
function enforceProvinceBuildingLimits(buildingTemplatesMap, provincesData, stateName, eventLog) {
  provincesData.forEach(province => {
    if (!province || province.owner !== stateName || !province.buildings) return;

    // Создаем карту для подсчета построек по типам
    const buildingCountMap = {};

    province.buildings.forEach(building => {
      if (building.name) {
        buildingCountMap[building.name] = (buildingCountMap[building.name] || 0) + 1;
      }
    });

    // Проверяем каждый тип постройки на превышение лимита
    for (const [buildingName, count] of Object.entries(buildingCountMap)) {
      const template = buildingTemplatesMap[buildingName];
      if (template && template.province_limit !== undefined && count > template.province_limit) {
        const excess = count - template.province_limit;

        // Находим избыточные постройки для удаления
        const buildingsToRemove = province.buildings.filter(b => b.name === buildingName).slice(-excess);

        buildingsToRemove.forEach(building => {
          const buildingIndex = province.buildings.indexOf(building);
          if (buildingIndex > -1) {
            province.buildings.splice(buildingIndex, 1);

            // Записываем сообщение в журнал событий
            eventLog.push([
              `Лимит построек типа "${buildingName}" для провинции "${province.province_id}" превышен ${count}/${template.province_limit}. Постройка была удалена.`,
              'ВНИМАНИЕ'
            ]);
          }
        });
      }
    }
  });
}

// Функция для применения глобальных лимитов построек
function enforceGlobalBuildingLimits(buildingTemplatesMap, provincesData, buildingTemplatesMapDuplicate, eventLog, stateName) {
  // Шаг 1: Определение глобальных лимитов
  const globalLimits = {};
  for (const buildingName in buildingTemplatesMap) {
    const template = buildingTemplatesMap[buildingName];
    if (template.global_limit !== undefined && template.global_limit > 0) {
      globalLimits[buildingName] = {
        limit: template.global_limit,
        currentCount: 0,
        buildings: [] // Список всех построек данного типа
      };
    }
  }

  Logger.log(`Применение глобальных лимитов для государства: ${stateName}`);

  // Шаг 2: Подсчёт текущего количества построек с глобальными лимитами
  provincesData.forEach(province => {
    if (!province || !province.buildings) return;

    province.buildings.forEach(building => {
      if (globalLimits.hasOwnProperty(building.name)) {
        globalLimits[building.name].currentCount++;
        globalLimits[building.name].buildings.push({
          province: province.province_id,
          building: building,
          owner: province.owner // Добавляем владельца провинции
        });
      }
    });
  });

  // Шаг 3: Проверка и применение лимитов
  for (const buildingName in globalLimits) {
    const { limit, currentCount, buildings } = globalLimits[buildingName];
    Logger.log(`Проверка глобального лимита для "${buildingName}": текущий счет = ${currentCount}, лимит = ${limit}`);

    if (currentCount > limit) {
      const excess = currentCount - limit;
      const ourBuildings = buildings.filter(b => b.owner === stateName);
      const otherBuildings = buildings.filter(b => b.owner !== stateName);

      Logger.log(`Наши постройки "${buildingName}": ${ourBuildings.length}`);
      Logger.log(`Постройки других государств "${buildingName}": ${otherBuildings.length}`);

      if (ourBuildings.length === 0) {
        // Нет построек, принадлежащих вашему государству, для удаления
        eventLog.push([
          `Глобальный лимит для постройки "${buildingName}" превышен (${currentCount}/${limit}), но нет построек в ваших провинциях для удаления.`,
          'Уведомление'
        ]);
        continue; // Переходим к следующему типу построек
      }

      // Определяем минимальный cycle_count среди чужих построек
      let minCycleCountOther = Infinity;
      if (otherBuildings.length > 0) {
        minCycleCountOther = Math.min(...otherBuildings.map(b => b.building.cycle_count));
      }

      Logger.log(`Минимальный cycle_count среди чужих построек "${buildingName}": ${minCycleCountOther}`);

      // Выбираем свои построения, которые не старее построек других государств
      const eligibleBuildingsToRemove = ourBuildings.filter(b => b.building.cycle_count <= minCycleCountOther);

      Logger.log(`Своих построек, подходящих для удаления "${buildingName}": ${eligibleBuildingsToRemove.length}`);

      if (eligibleBuildingsToRemove.length === 0) {
        // Нет своих построек, подходящих для удаления
        eventLog.push([
          `Глобальный лимит для постройки "${buildingName}" превышен (${currentCount}/${limit}), но все ваши постройки старее или равны по cycle_count построек других государств.`,
          'Уведомление'
        ]);
        continue; // Переходим к следующему типу построек
      }

      // Сортируем подходящие построения по cycle_count по возрастанию (самые новые первыми)
      eligibleBuildingsToRemove.sort((a, b) => {
        return a.building.cycle_count - b.building.cycle_count; // Новые постройки первыми
      });

      // Определяем количество построек, которые нужно удалить из своих построек
      const buildingsToRemoveCount = Math.min(excess, eligibleBuildingsToRemove.length);
      Logger.log(`Необходимо удалить ${buildingsToRemoveCount} построек "${buildingName}" из ваших провинций.`);

      // Удаление избыточных построек
      for (let i = 0; i < buildingsToRemoveCount; i++) {
        const buildingToRemove = eligibleBuildingsToRemove[i];
        const province = provincesData.find(p => p.province_id === buildingToRemove.province);
        if (province && province.buildings) {
          const index = province.buildings.indexOf(buildingToRemove.building);
          if (index > -1) {
            province.buildings.splice(index, 1);
            eventLog.push([
              `Лимит на количество построек "${buildingName}" превышен для мира. Постройка в вашей провинции "${province.province_id}" была удалена.`,
              'Уведомление'
            ]);
            Logger.log(`Удалена постройка "${buildingName}" из провинции "${province.province_id}".`);
          }
        }
      }
    }
  }
}

// Функция для чтения данных провинций.
function readProvincesData(data) {
  return data.provincesData;
}

// Функция для чтения данных склада из централизованных данных.
function readResourcesData(data) {
  return data.resourcesData;
}

// Чтение шаблонов построек уже централизовано в readAllData и хранится в data.buildingTemplatesMap

// Функция для сброса атрибутов провинции.
function resetProvinceAttributes(provinceAttributes) {
  const provinceAttributesResetMap = {
    'transport_infrastructure': true,
    // Добавьте другие атрибуты по необходимости
  };

  for (const attributeKey in provinceAttributesResetMap) {
    if (provinceAttributesResetMap[attributeKey]) {
      provinceAttributes[attributeKey] = 0;
    }
  }
}

// Применение модификаторов к зданиям
function applyBuildingModifiers(buildingTemplate) {
  const modifiers = buildingTemplate.modifiers || {};
  return {
    productionEfficiency: modifiers.production_efficiency || 1,
    extractionEfficiency: modifiers.extraction_efficiency || 1,
    consumptionEfficiency: modifiers.consumption_efficiency || 1
  };
}

// Функция проверки критериев
function checkCriteria(template, dataObject, type) {
  const criteriaList = getCriteriaList(type);
  let allSuccess = true;
  let reasons = [];

  for (const criterion of criteriaList) {
    const key = criterion.key;
    const attribute = criterion.attribute;
    const description = criterion.description;
    const dataType = criterion.dataType;
    const templateCriterion = template[key];

    if (templateCriterion) {
      let dataValue = dataObject[attribute];

      // Инициализация значения по умолчанию, если оно отсутствует
      if (dataValue === undefined || dataValue === null) {
        if (dataType === 'text') {
          dataValue = [];
        } else if (dataType === 'number') {
          dataValue = 0;
        }
      }

      // Специальная обработка для ресурсов в провинции
      if (attribute === 'resources') {
        if (Array.isArray(dataValue)) {
          dataValue = dataValue.map(res => res.split(':')[0]);
        } else {
          dataValue = [];
        }
      }

      const result = evaluateCondition(templateCriterion, dataValue, dataType);
      if (!result.success) {
        allSuccess = false;
        reasons.push(`${description}: ${result.reason}`);
      }
    }
  }

  if (allSuccess) {
    return { success: true };
  } else {
    return { success: false, reasons: reasons };
  }
}

// Получение списка критериев в зависимости от типа данных
function getCriteriaList(type) {
  if (type === 'province') {
    return [
      { key: 'required_province_cultures', attribute: 'cultures', description: 'Культуры', dataType: 'text' },
      { key: 'required_province_landscapes', attribute: 'landscapes', description: 'Ландшафты', dataType: 'text' },
      { key: 'required_province_religions', attribute: 'religions', description: 'Религии', dataType: 'text' },
      { key: 'required_province_races', attribute: 'races', description: 'Расы', dataType: 'text' },
      { key: 'required_province_climates', attribute: 'climates', description: 'Климат', dataType: 'text' },
      { key: 'required_province_resources', attribute: 'resources', description: 'Ресурсы', dataType: 'text' },
      { key: 'required_province_continents', attribute: 'continents', description: 'Континенты', dataType: 'text' },
      { key: 'required_province_planets', attribute: 'planets', description: 'Планеты', dataType: 'text' },
      // { key: 'required_province_radiation', attribute: 'radiation_level', description: 'Уровень радиации', dataType: 'number' },
      // { key: 'required_province_pollution', attribute: 'pollution_level', description: 'Уровень загрязнения', dataType: 'number' },
    ];
  } else if (type === 'state') {
    return [
      { key: 'required_state_cultures', attribute: 'cultures', description: 'Культуры государства', dataType: 'text' },
      { key: 'required_state_religions', attribute: 'religions', description: 'Религии государства', dataType: 'text' },
      { key: 'required_state_races', attribute: 'races', description: 'Расы государства', dataType: 'text' },
      { key: 'required_state_technologies', attribute: 'technologies', description: 'Технологии', dataType: 'text' },
      { key: 'required_state_laws', attribute: 'laws', description: 'Законы', dataType: 'text' },
      // { key: 'required_state_government', attribute: 'government_type', description: 'Тип правительства', dataType: 'text' },
      { key: 'required_state_stability', attribute: 'stability', description: 'Социальная стабильность', dataType: 'number' },
    ];
  }
  return [];
}

// Оценка условия для критериев
function evaluateCondition(condition, dataValue, dataType) {
  if (typeof condition === 'object' && !Array.isArray(condition)) {
    for (const operator in condition) {
      const operands = condition[operator];
      switch (operator) {
        case 'AND': {
          let reasons = [];
          let allSuccess = true;
          for (const op of operands) {
            const result = evaluateCondition(op, dataValue, dataType);
            if (!result.success) {
              allSuccess = false;
              reasons.push(result.reason);
            }
          }
          return allSuccess
            ? { success: true }
            : {
                success: false,
                reason: `Ожидалось ${describeConditionProvince({ AND: operands })}, но найдено ${formatDataValue(dataValue)}. Несоответствия: ${reasons.join('; ')}`,
              };
        }
        case 'OR': {
          let anySuccess = false;
          let reasons = [];
          for (const op of operands) {
            const result = evaluateCondition(op, dataValue, dataType);
            if (result.success) {
              anySuccess = true;
              break;
            } else {
              reasons.push(result.reason);
            }
          }
          return anySuccess
            ? { success: true }
            : {
                success: false,
                reason: `Ожидалось ${describeConditionProvince({ OR: operands })}, но найдено ${formatDataValue(dataValue)}. Причины: ${reasons.join('; ')}`,
              };
        }
        case 'NOT': {
          const result = evaluateCondition(operands[0], dataValue, dataType);
          return !result.success
            ? { success: true }
            : {
                success: false,
                reason: `Ожидалось ${describeConditionProvince({ NOT: operands })}, но найдено ${formatDataValue(dataValue)}`,
              };
        }
        case 'XOR': {
          let trueCount = 0;
          for (const op of operands) {
            const result = evaluateCondition(op, dataValue, dataType);
            if (result.success) {
              trueCount++;
            }
          }
          return trueCount === 1
            ? { success: true }
            : {
                success: false,
                reason: `Ожидалось ${describeConditionProvince({ XOR: operands })}, но найдено ${formatDataValue(dataValue)}`,
              };
        }
        case 'GREATER_THAN': {
          return dataValue > operands
            ? { success: true }
            : {
                success: false,
                reason: `Ожидалось значение больше ${operands}, но значение равно ${dataValue}`,
              };
        }
        case 'LESS_THAN': {
          return dataValue < operands
            ? { success: true }
            : {
                success: false,
                reason: `Ожидалось значение меньше ${operands}, но значение равно ${dataValue}`,
              };
        }
        case 'EQUALS': {
          return dataValue == operands
            ? { success: true }
            : {
                success: false,
                reason: `Ожидалось значение равно ${operands}, но значение равно ${dataValue}`,
              };
        }
        case 'NOT_EQUALS': {
          return dataValue != operands
            ? { success: true }
            : {
                success: false,
                reason: `Ожидалось значение не равно ${operands}, но значение равно ${dataValue}`,
              };
        }
        // Добавьте другие операторы по необходимости
        default:
          return { success: true };
      }
    }
  } else {
    // Базовый случай: сравнение значений
    if (dataType === 'text') {
      if (Array.isArray(dataValue)) {
        return dataValue.includes(condition)
          ? { success: true }
          : {
              success: false,
              reason: `Ожидалось значение "${condition}", но найдено ${formatDataValue(dataValue)}`,
            };
      } else {
        return dataValue == condition
          ? { success: true }
          : {
              success: false,
              reason: `Ожидалось значение "${condition}", но найдено "${dataValue}"`,
            };
      }
    } else if (dataType === 'number') {
      return dataValue == condition
        ? { success: true }
        : {
            success: false,
            reason: `Ожидалось значение ${condition}, но найдено ${dataValue}`,
          };
    }
  }
  return { success: true };
}

// Описание условия для логирования
function describeConditionProvince(condition) {
  if (typeof condition === 'string') {
    return `"${condition}"`;
  }

  if (Object.keys(condition).length === 0) {
    return ''; // Возвращаем пустую строку для пустого условия
  }

  if (condition.AND) {
    return `(${condition.AND.map(c => describeConditionProvince(c)).join(' и ')})`;
  }

  if (condition.OR) {
    return `(${condition.OR.map(c => describeConditionProvince(c)).join(' или ')})`;
  }

  if (condition.NOT) {
    return `не должно быть следующих значений: ${condition.NOT.map(c => describeConditionProvince(c)).join(' и ')}`;
  }

  if (condition.XOR) {
    return `только одно из следующих значений: ${condition.XOR.map(c => describeConditionProvince(c)).join(' или ')}`;
  }

  if (condition.GREATER_THAN !== undefined) {
    return `значение больше ${condition.GREATER_THAN}`;
  }

  if (condition.LESS_THAN !== undefined) {
    return `значение меньше ${condition.LESS_THAN}`;
  }

  if (condition.EQUALS !== undefined) {
    return `значение равно ${condition.EQUALS}`;
  }

  if (condition.NOT_EQUALS !== undefined) {
    return `значение не равно ${condition.NOT_EQUALS}`;
  }

  // Добавьте обработку других операторов при необходимости

  return 'неизвестное условие';
}

// Функция для форматирования сообщений о недостающих зависимых постройках
function formatMissingDependencies(criteria, missing) {
  if (typeof criteria === 'string') {
    return `Требуется наличие постройки: "${criteria}"`;
  }

  if (typeof criteria === 'object' && !Array.isArray(criteria)) {
    for (const operator in criteria) {
      const operands = criteria[operator];
      switch (operator.toUpperCase()) {
        case 'AND':
          return `Требуется наличие всех следующих построек: ${operands.map(op => formatMissingDependencies(op, missing)).join(', ')}`;
        
        case 'OR':
          return `Требуется наличие хотя бы одной из следующих построек: ${operands.map(op => formatMissingDependencies(op, missing)).join(', ')}`;
        
        case 'NOT':
          if (Array.isArray(operands)) {
            return `Требуется отсутствие следующих построек: ${operands.join(', ')}`;
          } else {
            return `Требуется отсутствие постройки: "${operands}"`;
          }
        
        case 'XOR':
          return `Требуется наличие ровно одной из следующих построек: ${operands.join(', ')}`;
        
        default:
          return `Требуется соответствие неизвестным условиям для построек`;
      }
    }
  }

  // Если критерий не соответствует ожидаемому формату
  return `Неизвестные требования для построек`;
}

// Функция проверки соответствия атрибутов провинции и государства требованиям постройки.
function checkBuildingAttributeRequirements(buildingTemplate, province, stateAttributes) {
  let allSuccess = true;
  let reasons = [];

  // Проверка атрибутов провинции
  if (buildingTemplate.required_province_attributes && Object.keys(buildingTemplate.required_province_attributes).length > 0) {
    for (const attribute in buildingTemplate.required_province_attributes) {
      const { min, max } = buildingTemplate.required_province_attributes[attribute];
      const provinceValue = province.province_attributes[attribute] || 0;

      if (min !== undefined && provinceValue < min) {
        allSuccess = false;
        reasons.push(`Атрибут провинции "${attribute}" меньше минимального (${provinceValue} < ${min})`);
      }
      if (max !== undefined && provinceValue > max) {
        allSuccess = false;
        reasons.push(`Атрибут провинции "${attribute}" больше максимального (${provinceValue} > ${max})`);
      }
    }
  }

  // Проверка атрибутов государства
  if (buildingTemplate.required_state_attributes && Object.keys(buildingTemplate.required_state_attributes).length > 0) {
    for (const attribute in buildingTemplate.required_state_attributes) {
      const { min, max } = buildingTemplate.required_state_attributes[attribute];
      const stateValue = stateAttributes[attribute] || 0;

      if (min !== undefined && stateValue < min) {
        allSuccess = false;
        reasons.push(`Атрибут государства "${attribute}" меньше минимального (${stateValue} < ${min})`);
      }
      if (max !== undefined && stateValue > max) {
        allSuccess = false;
        reasons.push(`Атрибут государства "${attribute}" больше максимального (${stateValue} > ${max})`);
      }
    }
  }

  return {
    success: allSuccess,
    reasons: reasons
  };
}

// Функция проверки и ограничения значений атрибутов провинций.
function enforceProvinceAttributeLimits(provincesData, stateName, eventLog) {
  // Шаг 1: Определение лимитов атрибутов провинций
  const attributeLimits = {
    "transport_infrastructure": {
      hasLimit: true,
      min: 0,
      max: 100,
      log: false, // Параметр отвечающий за вывод сообщения в журнал событий
      message: 'Провинция "{province_id}": Атрибут "{attribute}" скорректирован с {oldValue} до {newValue} из-за нарушения ограничения.'
    }
    // Добавьте другие атрибуты по необходимости
  };

  // Шаг 2: Проверка и корректировка атрибутов провинций
  provincesData.forEach(province => {
    if (!province || province.owner !== stateName) return; // Пропускаем провинции других стран

    if (!province.province_attributes) {
      province.province_attributes = {};
    }

    let attributesChanged = false;
    let provinceMessages = [];

    for (const attribute in attributeLimits) {
      const limit = attributeLimits[attribute];
      if (!limit.hasLimit) continue;

      if (province.province_attributes.hasOwnProperty(attribute)) {
        let value = province.province_attributes[attribute];
        const { min, max, log, message } = limit;
        let adjusted = false;
        let oldValue = value;
        let newValue = value;

        // Проверка на минимальное значение
        if (min !== null && value < min) {
          newValue = min;
          adjusted = true;
        }

        // Проверка на максимальное значение
        if (max !== null && value > max) {
          newValue = max;
          adjusted = true;
        }

        if (adjusted) {
          province.province_attributes[attribute] = newValue;
          attributesChanged = true;

          if (log && message) {
            const formattedMessage = message
              .replace('{province_id}', province.province_id || 'Неизвестен')
              .replace('{attribute}', attribute)
              .replace('{oldValue}', oldValue)
              .replace('{newValue}', newValue);
            provinceMessages.push(formattedMessage);
          }
        }
      }
    }

    if (attributesChanged && provinceMessages.length > 0) {
      eventLog.push([provinceMessages.join(' '), 'Уведомление']);
    }
  });
}

// Функция для генерации списка допустимых провинций для каждой постройки с учётом лимитов
function generateBuildableProvinces(provincesData, buildingTemplatesMap, stateData, stateName, attributesData) {
  // Создаём копию шаблонов построек, чтобы не изменять оригинальные данные
  const updatedBuildingTemplatesMap = JSON.parse(JSON.stringify(buildingTemplatesMap));

  // Предварительно подсчитываем количество построек каждого типа в государстве
  const stateBuildingCounts = {};

  provincesData.forEach(province => {
    if (!province || province.owner !== stateName || !province.buildings) return;
    province.buildings.forEach(building => {
      if (building.name) {
        stateBuildingCounts[building.name] = (stateBuildingCounts[building.name] || 0) + 1;
      }
    });
  });

  // Проходим по каждому шаблону постройки
  for (const buildingName in updatedBuildingTemplatesMap) {
    const template = updatedBuildingTemplatesMap[buildingName];
    template.buildable_provinces = []; // Инициализируем пустой список

    // Получаем лимиты из шаблона
    const globalLimit = template.global_limit || Infinity; // Если нет лимита, считаем его бесконечным
    const provinceLimit = template.province_limit || Infinity;

    const currentGlobalCount = stateBuildingCounts[buildingName] || 0;

    // Если достигнут глобальный лимит построек данного типа, пропускаем этот тип построек
    if (currentGlobalCount >= globalLimit) {
      continue;
    }

    let remainingGlobalLimit = globalLimit - currentGlobalCount;

    // Проходим по каждой провинции
    provincesData.forEach(province => {
      if (!province || province.owner !== stateName) return; // Рассматриваем только провинции текущего государства

      // Подсчитываем количество построек этого типа в провинции
      const currentProvinceCount = (province.buildings || []).filter(b => b.name === buildingName).length;

      // Проверяем, не достигнут ли лимит построек в провинции
      if (currentProvinceCount >= provinceLimit) {
        return; // Пропускаем провинцию, так как она достигла лимита
      }

      // Проверяем соответствие критериев провинции и государства, включая зависимые постройки и глобальный лимит
      const criteriaMet = checkBuildingCriteriaForBuildableProvinces(
        template,
        province,
        stateData,
        stateName,
        attributesData,
        remainingGlobalLimit
      );

      if (criteriaMet) {
        // Добавляем провинцию в список, если не превышен глобальный лимит
        template.buildable_provinces.push(province.province_id);
        // Уменьшаем оставшийся глобальный лимит
        remainingGlobalLimit--;
        // Увеличиваем счётчик построек
        stateBuildingCounts[buildingName] = (stateBuildingCounts[buildingName] || 0) + 1;
      }
    });
  }

  return updatedBuildingTemplatesMap;
}

// Модифицированная функция проверки критериев для генерации списка провинций
function checkBuildingCriteriaForBuildableProvinces(buildingTemplate, province, stateData, stateName, attributesData, remainingGlobalLimit) {
  // Проверка общих критериев провинции
  const provinceCriteriaMet = checkCriteria(buildingTemplate, province, 'province').success;
  if (!provinceCriteriaMet) return false;

  // Проверка общих критериев государства
  const stateCriteriaMet = checkCriteria(buildingTemplate, stateData, 'state').success;
  if (!stateCriteriaMet) return false;

  // Проверка атрибутов провинции и государства
  const attributesCheck = checkBuildingAttributeRequirements(buildingTemplate, province, attributesData);
  if (!attributesCheck.success) return false;

  // Проверка требований к рабочей силе
  const workerCheck = checkBuildingWorkerRequirements(buildingTemplate, province);
  if (!workerCheck.success) return false;

  // Проверка требований к землепользованию
  const landCheck = checkBuildingLandRequirements(buildingTemplate, province);
  if (!landCheck.success) return false;

  // Проверка зависимостей построек с использованием новой логики
  if (buildingTemplate.required_buildings) {
    const existingBuildings = province.buildings.map(b => b.name);
    const dependenciesResult = evaluateBuildingCriteria(buildingTemplate.required_buildings, existingBuildings);
    if (!dependenciesResult.met) {
      // Опционально: можно добавить логику для логирования причин отсутствия зависимостей
      return false;
    }
  }

  // Проверка глобального лимита
  if (remainingGlobalLimit <= 0) {
    return false; // Глобальный лимит достигнут
  }

  return true;
}

// Функция для обновления шаблонов построек в таблице с добавлением списка допустимых провинций
function updateBuildingTemplatesWithProvinces(data, updatedBuildingTemplatesMap) {
  // Все изменения уже внесены в объект data.buildingTemplatesMap
  // В writeAllData мы уже записываем обновленные шаблоны обратно в таблицу
  // Поэтому здесь ничего не делаем
}

// Функция проверки требований к рабочей силе для постройки
function checkBuildingWorkerRequirements(buildingTemplate, province) {
  const requiredWorkers = buildingTemplate.required_workers || 0;
  const freeWorkers = province.available_workers - province.occupied_workers;

  if (freeWorkers >= requiredWorkers) {
    return { success: true };
  } else {
    return {
      success: false
      // reason: `Недостаточно рабочих: требуется ${requiredWorkers}, доступно ${freeWorkers}`
    };
  }
}

// Функция проверки требований к землепользованию для постройки
function checkBuildingLandRequirements(buildingTemplate, province) {
  const requiredLand = buildingTemplate.required_agricultural_land || 0;
  const freeLand = province.agricultural_land_free || 0;

  if (freeLand >= requiredLand) {
    return { success: true };
  } else {
    return {
      success: false
      // reason: `Недостаточно земель: требуется ${requiredLand}, доступно ${freeLand}`
    };
  }
}

// Функция для обновления cycle_count для построек в провинциях, принадлежащих государству
function updateCycleCounts(provincesData, stateName) {
  provincesData.forEach(province => {
    if (!province || province.owner !== stateName || !province.buildings) return;

    province.buildings.forEach(building => {
      if (building && typeof building === 'object') {
        if (building.cycle_count === undefined || building.cycle_count === null) {
          building.cycle_count = 1; // Инициализация cycle_count, если его нет
        } else {
          building.cycle_count += 1; // Увеличение cycle_count
        }
      }
    });
  });
}

// Рекурсивная функция для оценки логических условий в required_buildings
function evaluateBuildingCriteria(criteria, existingBuildings, missingBuildings = []) {
  if (typeof criteria === 'string') {
    if (!existingBuildings.includes(criteria)) {
      missingBuildings.push(criteria);
      return { met: false, missing: [criteria] };
    }
    return { met: true, missing: [] };
  }

  if (typeof criteria === 'object') {
    for (const operator in criteria) {
      const operands = criteria[operator];
      switch (operator.toUpperCase()) {
        case 'AND':
          let andMissing = [];
          const andMet = operands.every(operand => {
            const result = evaluateBuildingCriteria(operand, existingBuildings, andMissing);
            andMissing = andMissing.concat(result.missing);
            return result.met;
          });
          return { met: andMet, missing: andMissing };

        case 'OR':
          let orMissing = [];
          const orMet = operands.some(operand => {
            const result = evaluateBuildingCriteria(operand, existingBuildings, orMissing);
            if (result.met) return true;
            orMissing = orMissing.concat(result.missing);
            return false;
          });
          if (orMet) {
            return { met: true, missing: [] };
          } else {
            return { met: false, missing: orMissing };
          }

        case 'NOT':
          if (Array.isArray(operands)) {
            let notMissing = [];
            const notMet = operands.every(operand => {
              const result = evaluateBuildingCriteria(operand, existingBuildings, notMissing);
              return !result.met;
            });
            if (notMet) {
              return { met: true, missing: [] };
            } else {
              notMissing.push(...operands.filter(operand => existingBuildings.includes(operand)));
              return { met: false, missing: notMissing };
            }
          } else {
            const result = evaluateBuildingCriteria(operands, existingBuildings, missingBuildings);
            if (!result.met) {
              return { met: true, missing: [] };
            } else {
              missingBuildings.push(operands);
              return { met: false, missing: [operands] };
            }
          }

        case 'XOR':
          const trueCount = operands.reduce((count, operand) => {
            return count + (evaluateBuildingCriteria(operand, existingBuildings, missingBuildings).met ? 1 : 0);
          }, 0);
          if (trueCount === 1) {
            return { met: true, missing: [] };
          } else {
            // Собираем отсутствующие постройки, если ни одна не выполнена
            if (trueCount === 0) {
              return { met: false, missing: operands };
            }
            // Если выполнено более одного условия, указываем, что требуется ровно одно
            return { met: false, missing: [] }; // Можно добавить специальное сообщение
          }

        default:
          Logger.log(`Неизвестный оператор: ${operator}`);
          return { met: true, missing: [] }; // По умолчанию считаем, что условие выполнено
      }
    }
  }

  // Если критерий не соответствует ожидаемому формату
  return { met: true, missing: [] };
}

// Функция для форматирования сообщений о недостающих зависимых постройках
function formatMissingDependencies(criteria, missing) {
  if (typeof criteria === 'string') {
    return `Требуется наличие постройки: "${criteria}"`;
  }

  if (typeof criteria === 'object' && !Array.isArray(criteria)) {
    for (const operator in criteria) {
      const operands = criteria[operator];
      switch (operator.toUpperCase()) {
        case 'AND':
          return `Требуется наличие всех следующих построек: ${operands.map(op => formatMissingDependencies(op, missing)).join(', ')}`;
        
        case 'OR':
          return `Требуется наличие хотя бы одной из следующих построек: ${operands.map(op => formatMissingDependencies(op, missing)).join(', ')}`;
        
        case 'NOT':
          if (Array.isArray(operands)) {
            return `Требуется отсутствие следующих построек: ${operands.join(', ')}`;
          } else {
            return `Требуется отсутствие постройки: "${operands}"`;
          }
        
        case 'XOR':
          return `Требуется наличие ровно одной из следующих построек: ${operands.join(', ')}`;
        
        default:
          return `Требуется соответствие неизвестным условиям для построек`;
      }
    }
  }

  // Если критерий не соответствует ожидаемому формату
  return `Неизвестные требования для построек`;
}

// Функция для проверки соответствия атрибутов провинции и государства требованиям постройки.
function checkBuildingAttributeRequirements(buildingTemplate, province, stateAttributes) {
  let allSuccess = true;
  let reasons = [];

  // Проверка атрибутов провинции
  if (buildingTemplate.required_province_attributes && Object.keys(buildingTemplate.required_province_attributes).length > 0) {
    for (const attribute in buildingTemplate.required_province_attributes) {
      const { min, max } = buildingTemplate.required_province_attributes[attribute];
      const provinceValue = province.province_attributes[attribute] || 0;

      if (min !== undefined && provinceValue < min) {
        allSuccess = false;
        reasons.push(`Атрибут провинции "${attribute}" меньше минимального (${provinceValue} < ${min})`);
      }
      if (max !== undefined && provinceValue > max) {
        allSuccess = false;
        reasons.push(`Атрибут провинции "${attribute}" больше максимального (${provinceValue} > ${max})`);
      }
    }
  }

  // Проверка атрибутов государства
  if (buildingTemplate.required_state_attributes && Object.keys(buildingTemplate.required_state_attributes).length > 0) {
    for (const attribute in buildingTemplate.required_state_attributes) {
      const { min, max } = buildingTemplate.required_state_attributes[attribute];
      const stateValue = stateAttributes[attribute] || 0;

      if (min !== undefined && stateValue < min) {
        allSuccess = false;
        reasons.push(`Атрибут государства "${attribute}" меньше минимального (${stateValue} < ${min})`);
      }
      if (max !== undefined && stateValue > max) {
        allSuccess = false;
        reasons.push(`Атрибут государства "${attribute}" больше максимального (${stateValue} > ${max})`);
      }
    }
  }

  return {
    success: allSuccess,
    reasons: reasons
  };
}

// Функция для проверки требований к рабочей силе для постройки
function checkBuildingWorkerRequirements(buildingTemplate, province) {
  const requiredWorkers = buildingTemplate.required_workers || 0;
  const freeWorkers = province.available_workers - province.occupied_workers;

  if (freeWorkers >= requiredWorkers) {
    return { success: true };
  } else {
    return {
      success: false
      // reason: `Недостаточно рабочих: требуется ${requiredWorkers}, доступно ${freeWorkers}`
    };
  }
}

// Функция для проверки требований к землепользованию для постройки
function checkBuildingLandRequirements(buildingTemplate, province) {
  const requiredLand = buildingTemplate.required_agricultural_land || 0;
  const freeLand = province.agricultural_land_free || 0;

  if (freeLand >= requiredLand) {
    return { success: true };
  } else {
    return {
      success: false
      // reason: `Недостаточно земель: требуется ${requiredLand}, доступно ${freeLand}`
    };
  }
}

// Функция для обновления cycle_count для построек в провинциях, принадлежащих государству
function updateCycleCounts(provincesData, stateName) {
  provincesData.forEach(province => {
    if (!province || province.owner !== stateName || !province.buildings) return;

    province.buildings.forEach(building => {
      if (building && typeof building === 'object') {
        if (building.cycle_count === undefined || building.cycle_count === null) {
          building.cycle_count = 1; // Инициализация cycle_count, если его нет
        } else {
          building.cycle_count += 1; // Увеличение cycle_count
        }
      }
    });
  });
}

// Функция обработки самоуничтожения построек
function processSelfDestruction(building, province, eventLog) {
  if (!building.hasOwnProperty('self_destruction')) {
    // Если ключ отсутствует, инициализируем его значением 10
    building.self_destruction = 10;
  }

  if (building.status === 'Активная') {
    building.self_destruction = 10;
  } else if (building.status === 'Неактивная') {
    building.self_destruction = Math.max(building.self_destruction - 1, 0);

    if (building.self_destruction <= 3 && building.self_destruction > 0) {
      eventLog.push([
        `Здание "${building.name}" в провинции "${province.province_id}" будет снесено через ${building.self_destruction} ходов по причине длительной неактивности.`,
        'Уведомление'
      ]);
    }

    if (building.self_destruction === 0) {
      // Удаляем здание из провинции
      const buildingIndex = province.buildings.indexOf(building);
      if (buildingIndex > -1) {
        province.buildings.splice(buildingIndex, 1);
        eventLog.push([
          `Здание "${building.name}" в провинции "${province.province_id}" было снесено из-за длительной неактивности.`,
          'Уведомление'
        ]);
      }
    }
  }
}

// Форматирование значения данных для логирования
function formatDataValue(dataValue) {
  if (Array.isArray(dataValue)) {
    return `[${dataValue.join(', ')}]`;
  }
  return dataValue;
}

// Функция для генерации списка допустимых провинций для каждой постройки с учётом лимитов
function generateBuildableProvinces(provincesData, buildingTemplatesMap, stateData, stateName, attributesData) {
  // Создаём копию шаблонов построек, чтобы не изменять оригинальные данные
  const updatedBuildingTemplatesMap = JSON.parse(JSON.stringify(buildingTemplatesMap));

  // Предварительно подсчитываем количество построек каждого типа в государстве
  const stateBuildingCounts = {};

  provincesData.forEach(province => {
    if (!province || province.owner !== stateName || !province.buildings) return;
    province.buildings.forEach(building => {
      if (building.name) {
        stateBuildingCounts[building.name] = (stateBuildingCounts[building.name] || 0) + 1;
      }
    });
  });

  // Проходим по каждому шаблону постройки
  for (const buildingName in updatedBuildingTemplatesMap) {
    const template = updatedBuildingTemplatesMap[buildingName];
    template.buildable_provinces = []; // Инициализируем пустой список

    // Получаем лимиты из шаблона
    const globalLimit = template.global_limit || Infinity; // Если нет лимита, считаем его бесконечным
    const provinceLimit = template.province_limit || Infinity;

    const currentGlobalCount = stateBuildingCounts[buildingName] || 0;

    // Если достигнут глобальный лимит построек данного типа, пропускаем этот тип построек
    if (currentGlobalCount >= globalLimit) {
      continue;
    }

    let remainingGlobalLimit = globalLimit - currentGlobalCount;

    // Проходим по каждой провинции
    provincesData.forEach(province => {
      if (!province || province.owner !== stateName) return; // Рассматриваем только провинции текущего государства

      // Подсчитываем количество построек этого типа в провинции
      const currentProvinceCount = (province.buildings || []).filter(b => b.name === buildingName).length;

      // Проверяем, не достигнут ли лимит построек в провинции
      if (currentProvinceCount >= provinceLimit) {
        return; // Пропускаем провинцию, так как она достигла лимита
      }

      // Проверяем соответствие критериев провинции и государства, включая зависимые постройки и глобальный лимит
      const criteriaMet = checkBuildingCriteriaForBuildableProvinces(
        template,
        province,
        stateData,
        stateName,
        attributesData,
        remainingGlobalLimit
      );

      if (criteriaMet) {
        // Добавляем провинцию в список, если не превышен глобальный лимит
        template.buildable_provinces.push(province.province_id);
        // Уменьшаем оставшийся глобальный лимит
        remainingGlobalLimit--;
        // Увеличиваем счётчик построек
        stateBuildingCounts[buildingName] = (stateBuildingCounts[buildingName] || 0) + 1;
      }
    });
  }

  return updatedBuildingTemplatesMap;
}

// Модифицированная функция проверки критериев для генерации списка провинций
function checkBuildingCriteriaForBuildableProvinces(buildingTemplate, province, stateData, stateName, attributesData, remainingGlobalLimit) {
  // Проверка общих критериев провинции
  const provinceCriteriaMet = checkCriteria(buildingTemplate, province, 'province').success;
  if (!provinceCriteriaMet) return false;

  // Проверка общих критериев государства
  const stateCriteriaMet = checkCriteria(buildingTemplate, stateData, 'state').success;
  if (!stateCriteriaMet) return false;

  // Проверка атрибутов провинции и государства
  const attributesCheck = checkBuildingAttributeRequirements(buildingTemplate, province, attributesData);
  if (!attributesCheck.success) return false;

  // Проверка требований к рабочей силе
  const workerCheck = checkBuildingWorkerRequirements(buildingTemplate, province);
  if (!workerCheck.success) return false;

  // Проверка требований к землепользованию
  const landCheck = checkBuildingLandRequirements(buildingTemplate, province);
  if (!landCheck.success) return false;

  // Проверка зависимостей построек с использованием новой логики
  if (buildingTemplate.required_buildings) {
    const existingBuildings = province.buildings.map(b => b.name);
    const dependenciesResult = evaluateBuildingCriteria(buildingTemplate.required_buildings, existingBuildings);
    if (!dependenciesResult.met) {
      // Опционально: можно добавить логику для логирования причин отсутствия зависимостей
      return false;
    }
  }

  // Проверка глобального лимита
  if (remainingGlobalLimit <= 0) {
    return false; // Глобальный лимит достигнут
  }

  return true;
}

// Функция для обновления cycle_count для построек в провинциях, принадлежащих государству
function updateCycleCounts(provincesData, stateName) {
  provincesData.forEach(province => {
    if (!province || province.owner !== stateName || !province.buildings) return;

    province.buildings.forEach(building => {
      if (building && typeof building === 'object') {
        if (building.cycle_count === undefined || building.cycle_count === null) {
          building.cycle_count = 1; // Инициализация cycle_count, если его нет
        } else {
          building.cycle_count += 1; // Увеличение cycle_count
        }
      }
    });
  });
}
