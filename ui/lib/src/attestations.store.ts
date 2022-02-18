import { EntryHashB64, HeaderHashB64, AgentPubKeyB64, serializeHash } from '@holochain-open-dev/core-types';
import { CellClient } from '@holochain-open-dev/cell-client';
import { writable, Writable, derived, Readable, get } from 'svelte/store';

import { AttestationsService } from './attestations.service';
import {
  Dictionary,
  Attestation,
  AttestationOutput,
  GetAttestationsInput,
} from './types';
import {
  ProfilesStore,
  Profile,
} from "@holochain-open-dev/profiles";

const areEqual = (first: Uint8Array, second: Uint8Array) =>
      first.length === second.length && first.every((value, index) => value === second[index]);

export class AttestationsStore {
  /** Private */
  private service : AttestationsService
  private profiles: ProfilesStore

  /** AttestationEh -> Attestation */
  private myAttestationsStore: Writable<Dictionary<AttestationOutput>> = writable({});
  private searchedAttestationsStore: Writable<Dictionary<AttestationOutput>> = writable({});
  
  /** Static info */
  myAgentPubKey: AgentPubKeyB64;

  /** Readable stores */
  public myAttestations: Readable<Dictionary<AttestationOutput>> = derived(this.myAttestationsStore, i => i)
  public searchedAttestations: Readable<Dictionary<AttestationOutput>> = derived(this.searchedAttestationsStore, i => i)
  
  constructor(
    protected cellClient: CellClient,
  profilesStore: ProfilesStore,
  zomeName = 'hc_zome_attestations'
  ) {
    this.myAgentPubKey = serializeHash(cellClient.cellId[1]);
    this.profiles = profilesStore;
    this.service = new AttestationsService(cellClient, zomeName);

    cellClient.addSignalHandler( signal => {
      if (! areEqual(cellClient.cellId[0],signal.data.cellId[0]) || !areEqual(cellClient.cellId[1], signal.data.cellId[1])) {
        return
      }
      console.log("SIGNAL",signal)
      const payload = signal.data.payload
      switch(payload.message.type) {
      case "":
        break;
      }
    })
  }

  private others(): Array<AgentPubKeyB64> {
    return Object.keys(get(this.profiles.knownProfiles)).filter((key)=> key != this.myAgentPubKey)
  }

  async getProfile(agent: AgentPubKeyB64) : Promise<Profile|undefined> {
    return this.profiles.fetchAgentProfile(agent)
  }

  async pullMyAttestations() : Promise<Dictionary<AttestationOutput>> {
    const attestationsOutputs = await this.service.getMyAttestations();
    //console.log({attestations})
    for (const a of attestationsOutputs) {
      this.myAttestationsStore.update(attestations => {
        attestations[a.hash] = a
        return attestations
      })
    }
    return get(this.myAttestationsStore)
  }

  async searchAttestations(search: string) : Promise<Dictionary<AttestationOutput>> {
    const input : GetAttestationsInput = {}
    if (search.startsWith("uhCA")) {
      input.agent = search
    } else {
      input.content = search
    }
    console.log("searching for", input)
    const attestationsOutputs = await this.service.getAttestations(input);
    console.log({attestationsOutputs})
    this.searchedAttestationsStore.update(attestations => {
      attestations = {}
      for (const a of attestationsOutputs) {
        attestations[a.hash] = a
      }
      return attestations
    })
    return get(this.searchedAttestationsStore)
  }


  async addAttestation(attestation: Attestation) : Promise<EntryHashB64> {
    const s: Attestation = {
      content: attestation.content,
      about: attestation.about,
    };
    const attestationEh: EntryHashB64 = await this.service.createAttestation(s)
    await this.pullMyAttestations()
    return attestationEh
  }

  attestation(attestationEh: EntryHashB64): AttestationOutput {
    return get(this.myAttestationsStore)[attestationEh];
  }
}
