import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const examplesDir = new URL("../examples/", import.meta.url);

test("examples use canonical payload shapes", async () => {
  const files = (await readdir(examplesDir)).filter((file) => file.endsWith(".json"));
  assert.equal(files.length, 5);
  for (const file of files) {
    const example = JSON.parse(await readFile(new URL(file, examplesDir), "utf8"));
    assert.equal(typeof example.tool, "string", file);
    assert.equal(example.arguments.start, undefined, file);
    assert.equal(typeof example.arguments.run_name, "string", file);
    validatePayload(example.tool, example.arguments.payload, file);
  }
});

function validatePayload(tool, payload, file) {
  assert.equal(typeof payload, "object", file);
  if (tool === "boltz_structure_and_binding") {
    assertProteinEntityList(payload.entities, file);
    assert.equal(payload.binding.type, "ligand_protein_binding", file);
    assert.equal(typeof payload.binding.binder_chain_id, "string", file);
    return;
  }
  if (tool === "boltz_small_molecule_screen") {
    assertMoleculeList(payload.molecules, file);
    assertSmallMoleculeTarget(payload.target, file);
    return;
  }
  if (tool === "boltz_small_molecule_design") {
    assert.equal(payload.num_molecules >= 10, true, file);
    assertSmallMoleculeTarget(payload.target, file);
    return;
  }
  if (tool === "boltz_protein_screen") {
    assert.equal(Array.isArray(payload.proteins), true, file);
    assertProteinEntityList(payload.proteins[0].entities, file);
    assertProteinTarget(payload.target, file);
    return;
  }
  if (tool === "boltz_protein_design") {
    assert.equal(payload.num_proteins >= 10, true, file);
    assertProteinTarget(payload.target, file);
    assert.equal(payload.binder_specification.type, "no_template", file);
    assert.equal(typeof payload.binder_specification.modality, "string", file);
    assert.equal(payload.binder_specification.entities.some((entity) => entity.type === "designed_protein"), true, file);
    return;
  }
  assert.fail(`Unexpected tool in ${file}: ${tool}`);
}

function assertMoleculeList(molecules, file) {
  assert.equal(Array.isArray(molecules), true, file);
  assert.equal(typeof molecules[0].smiles, "string", file);
}

function assertSmallMoleculeTarget(target, file) {
  assertProteinEntityList(target.entities, file);
}

function assertProteinTarget(target, file) {
  assert.equal(target.type, "no_template", file);
  assertProteinEntityList(target.entities, file);
}

function assertProteinEntityList(entities, file) {
  assert.equal(Array.isArray(entities), true, file);
  assert.equal(entities.length > 0, true, file);
  for (const entity of entities) {
    assert.equal(typeof entity.type, "string", file);
    assert.equal(Array.isArray(entity.chain_ids), true, file);
    assert.equal(typeof entity.value, "string", file);
  }
}
