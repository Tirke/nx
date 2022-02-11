import {
  addProjectConfiguration,
  joinPathFragments,
  ProjectConfiguration,
  readProjectConfiguration,
  Tree,
} from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import {
  updateImports,
  updateProjectPaths,
  verifyProjectForUpgrade,
} from './conversion.util';

describe('convertToCypressTen', () => {
  let tree: Tree;
  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  describe('updateProjectPaths', () => {
    const cypressConfigs = {
      cypressConfigTs: {
        e2e: {
          integrationFolder: 'src/e2e',
          supportFile: 'src/support/e2e.ts',
        },
      },
      cypressConfigJson: {
        integrationFolder: 'src/integration',
        supportFile: 'src/support/index.ts',
      },
    };

    const projectConfig = {
      root: 'apps/app-e2e',
      sourceRoot: 'apps/app-e2e/src',
    };
    const filePaths = [
      'src/integration/something.spec.ts',
      'src/integration/another.spec.ts',
      'src/integration/blah/another/a.spec.ts',
      'src/integration/blah/c/a.spec.ts',
      'src/support/index.ts',
      'src/plugins/index.ts',
      'src/fixtures/example.json',
    ];

    beforeEach(() => {
      for (const path of filePaths) {
        tree.write(
          joinPathFragments(projectConfig.root, path),
          String.raw`
import { getGreeting } from '../support/app.po';

import { blah } from '../support';
const eh = require('../support')

import { blah } from "../support";
const eh = require("../support")

import { blah } from '../../support';
const eh = require('../../support')

import { blah } from "../../support";
const eh = require("../../support")
`
        );
      }
    });

    it('should rename old support file to e2e.ts', () => {
      const newSupportFile = joinPathFragments(
        projectConfig.root,
        cypressConfigs.cypressConfigTs.e2e.supportFile
      );
      const oldSupportFile = joinPathFragments(
        projectConfig.root,
        cypressConfigs.cypressConfigJson.supportFile
      );
      updateProjectPaths(tree, projectConfig, cypressConfigs);

      expect(tree.exists(newSupportFile)).toEqual(true);
      expect(tree.exists(oldSupportFile)).toEqual(false);
    });

    it('should rename files .spec. to .cy.', () => {
      const specs = tree
        .children(projectConfig.root)
        .filter((path) => path.endsWith('.spec.ts'));

      updateProjectPaths(tree, projectConfig, cypressConfigs);
      const actualSpecs = tree
        .children(projectConfig.root)
        .filter((path) => path.endsWith('.spec.ts'));
      const actualCy = tree
        .children(projectConfig.root)
        .filter((path) => path.endsWith('.cy.ts'));

      expect(actualSpecs.length).toEqual(0);
      expect(actualCy.length).toEqual(specs.length);
    });

    it('should move files to the new integration folder (e2e/)', () => {
      const newIntegrationFolder = joinPathFragments(
        projectConfig.root,
        cypressConfigs.cypressConfigTs.e2e.integrationFolder
      );
      const oldIntegrationFolder = joinPathFragments(
        projectConfig.root,
        cypressConfigs.cypressConfigJson.integrationFolder
      );
      const oldIntegrationFolderContents = tree.children(oldIntegrationFolder);

      updateProjectPaths(tree, projectConfig, cypressConfigs);

      const newIntegrationFolderContents = tree.children(newIntegrationFolder);

      expect(tree.exists(oldIntegrationFolder)).toEqual(false);
      expect(newIntegrationFolderContents.length).toEqual(
        oldIntegrationFolderContents.length
      );
      expect(tree.exists('apps/app-e2e/src/fixtures/example.json')).toEqual(
        true
      );
    });
  });

  describe('verifyProjectForUpgrade', () => {
    let projectConfiguration: ProjectConfiguration;

    beforeEach(() => {
      addProjectConfiguration(tree, 'app-e2e', {
        root: 'apps/app-e2e',
        sourceRoot: 'apps/app-e2e/src',
        targets: {
          e2e: {
            executor: '@nrwl/cypress:cypress',
            options: {
              cypressConfig: 'apps/app-e2e/cypress.json',
              devServerTarget: 'app:serve',
            },
          },
        },
      });
      tree.write('apps/app-e2e/cypress.json', '{}');
      projectConfiguration = readProjectConfiguration(tree, 'app-e2e');
    });

    it('should not upgrade if both cypress configs are present', () => {
      tree.write('apps/app-e2e/cypress.config.ts', `blah`);
      const actual = verifyProjectForUpgrade(tree, projectConfiguration, 'e2e');
      expect(actual).toMatchSnapshot();
    });

    it('should not upgrade if not using cypress executor', () => {
      projectConfiguration.targets.e2e.executor = 'not cypress executor';
      const actual = verifyProjectForUpgrade(tree, projectConfiguration, 'e2e');
      expect(actual).toMatchSnapshot();
    });

    it('should allow upgrade', () => {
      tree.delete('apps/app-e2e/cypress.config.ts');

      const actual = verifyProjectForUpgrade(tree, projectConfiguration, 'e2e');

      expect(actual).toMatchSnapshot();
    });
  });

  describe('updateImports', () => {
    const filePath = 'apps/app-e2e/src/e2e/sometest.cy.ts';
    const fileContents = String.raw`
import { getGreeting } from '../support/app.po';

import { blah } from '../support';
const eh = require('../support')

import { blah } from "../support";
const eh = require("../support")

describe('a', () => {
  beforeEach(() => {
    cy.visit('/')
    blah()
    eh()
  });

  it('should display welcome message', () => {
    // Custom command example, see \`../support/commands.ts\` file
    cy.login('my-email@something.com', 'myPassword');

    // Function helper example, see \`../support/app.po.ts\` file
    getGreeting().contains('Welcome a');
  });
});

`;

    beforeEach(() => {
      tree.write(filePath, fileContents);
    });

    it('should update imports', () => {
      updateImports(tree, filePath, 'support', 'support/e2e');
      const actual = tree.read(filePath, 'utf-8');

      expect(actual).toMatchSnapshot();
    });
  });
});