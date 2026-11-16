export type DocumentationSourceId = 'covesa_vss' | 'nestjs_docs';

export interface DocumentationSourceEntry {
  sourceId: DocumentationSourceId;
  externalId: string;
  fallbackTitle: string;
  rawUrl: string;
  sourceUrl: string;
  license: string;
}

const COVESA_RAW_BASE =
  'https://raw.githubusercontent.com/COVESA/vehicle_signal_specification/master/docs-gen/content';
const COVESA_WEB_BASE = 'https://covesa.github.io/vehicle_signal_specification';

const NESTJS_RAW_BASE = 'https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content';
const NESTJS_WEB_BASE = 'https://docs.nestjs.com';

function createCovesaEntry(relativePath: string, fallbackTitle: string): DocumentationSourceEntry {
  const webSlug = relativePath.replace(/\.md$/, '/');
  return {
    sourceId: 'covesa_vss',
    externalId: `docs-gen/content/${relativePath}`,
    fallbackTitle,
    rawUrl: `${COVESA_RAW_BASE}/${relativePath}`,
    sourceUrl: `${COVESA_WEB_BASE}/${webSlug}`,
    license: 'MPL-2.0',
  };
}

function createNestJsEntry(
  relativePath: string,
  fallbackTitle: string,
  webPathOverride?: string,
): DocumentationSourceEntry {
  const webPath = webPathOverride ?? relativePath.replace(/\.md$/, '');
  return {
    sourceId: 'nestjs_docs',
    externalId: `content/${relativePath}`,
    fallbackTitle,
    rawUrl: `${NESTJS_RAW_BASE}/${relativePath}`,
    sourceUrl: `${NESTJS_WEB_BASE}/${webPath}`,
    license: 'MIT',
  };
}

/**
 * Curated subset of public COVESA VSS and NestJS Markdown documentation pages.
 * Fetching specific paths avoids cloning full repositories and keeps the corpus focused.
 */
export const DOCUMENTATION_SOURCES: readonly DocumentationSourceEntry[] = [
  // COVESA Vehicle Signal Specification (MPL-2.0) — 20 core pages
  createCovesaEntry('introduction/overview.md', 'VSS Overview'),
  createCovesaEntry('introduction/taxonomy.md', 'VSS Taxonomy'),
  createCovesaEntry('rule_set/basics.md', 'VSS Rule Set Basics'),
  createCovesaEntry('rule_set/branches.md', 'VSS Branches'),
  createCovesaEntry('rule_set/includes.md', 'VSS Includes'),
  createCovesaEntry('rule_set/instances.md', 'VSS Instances'),
  createCovesaEntry(
    'rule_set/data_entry/sensor_actuator.md',
    'VSS Sensors, Actuators, and Attributes',
  ),
  createCovesaEntry('rule_set/data_entry/data_types.md', 'VSS Data Types'),
  createCovesaEntry('rule_set/data_entry/data_types_struct.md', 'VSS Struct Data Types'),
  createCovesaEntry('rule_set/data_entry/data_units.md', 'VSS Data Units'),
  createCovesaEntry('rule_set/data_entry/default.md', 'VSS Default Values'),
  createCovesaEntry('rule_set/data_entry/allowed.md', 'VSS Allowed Values'),
  createCovesaEntry('rule_set/data_entry/enum.md', 'VSS Enumerations'),
  createCovesaEntry('rule_set/data_entry/description.md', 'VSS Descriptions'),
  createCovesaEntry('catalog/energy_management.md', 'VSS Energy Management'),
  createCovesaEntry('catalog/vehicle_motion_management.md', 'VSS Vehicle Motion Management'),
  createCovesaEntry('extensions/overlay.md', 'VSS Overlays'),
  createCovesaEntry('extensions/cybersecurity_profile.md', 'VSS Cybersecurity Profile'),
  createCovesaEntry(
    'extensions/network_serialization_profile.md',
    'VSS Network Serialization Profile',
  ),
  createCovesaEntry('policies/unit_datatype.md', 'VSS Unit and Datatype Policy'),

  // NestJS Official Documentation (MIT) — 16 core pages
  createNestJsEntry('introduction.md', 'NestJS Introduction'),
  createNestJsEntry('first-steps.md', 'NestJS First Steps'),
  createNestJsEntry('controllers.md', 'NestJS Controllers'),
  createNestJsEntry('components.md', 'NestJS Providers', 'providers'),
  createNestJsEntry('custom-decorators.md', 'NestJS Custom Decorators'),
  createNestJsEntry('exception-filters.md', 'NestJS Exception Filters'),
  createNestJsEntry('guards.md', 'NestJS Guards'),
  createNestJsEntry('interceptors.md', 'NestJS Interceptors'),
  createNestJsEntry('fundamentals/dependency-injection.md', 'NestJS Dependency Injection'),
  createNestJsEntry('fundamentals/dynamic-modules.md', 'NestJS Dynamic Modules'),
  createNestJsEntry('fundamentals/execution-context.md', 'NestJS Execution Context'),
  createNestJsEntry('fundamentals/lifecycle-events.md', 'NestJS Lifecycle Events'),
  createNestJsEntry('fundamentals/provider-scopes.md', 'NestJS Provider Scopes'),
  createNestJsEntry('fundamentals/unit-testing.md', 'NestJS Testing'),
  createNestJsEntry('application/configuration.md', 'NestJS Configuration'),
  createNestJsEntry('application/validation.md', 'NestJS Validation'),
];
