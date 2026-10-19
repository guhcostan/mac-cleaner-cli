#!/usr/bin/env ruby
# Validate the planning contract, not the product implementation.
require 'yaml'
require 'json'
require 'set'

ROOT = File.expand_path(__dir__)

def assert(condition, message)
  raise message unless condition
end

def check_yaml_keys(node, path)
  return unless node
  if node.is_a?(Psych::Nodes::Mapping)
    seen = Set.new
    node.children.each_slice(2) do |key, value|
      assert(key.is_a?(Psych::Nodes::Scalar), "Non-scalar YAML key at #{path}")
      assert(seen.add?(key.value), "Duplicate YAML key #{key.value} at #{path}")
      check_yaml_keys(value, "#{path}.#{key.value}")
    end
  elsif node.is_a?(Psych::Nodes::Alias)
    raise "YAML alias not supported at #{path}"
  elsif node.respond_to?(:children) && node.children
    node.children.each_with_index { |child, i| check_yaml_keys(child, "#{path}[#{i}]") }
  end
end

def yaml(name)
  content = File.read(File.join(ROOT, name))
  check_yaml_keys(YAML.parse_stream(content), name)
  YAML.load(content)
end

class UniqueHash < Hash
  def []=(key, value)
    raise "Duplicate JSON key #{key}" if key?(key)
    super
  end
end

def json(name)
  JSON.parse(File.read(File.join(ROOT, name)), object_class: UniqueHash)
end

def ids(items, field = 'id')
  values = items.map { |item| item.fetch(field) }
  assert(values.length == values.uniq.length, "Duplicate #{field}: #{values}")
  values.to_set
end

def references(values, known, label)
  missing = values.to_set - known
  assert(missing.empty?, "Unknown references in #{label}: #{missing.to_a}")
end

prd = yaml('repo_artifact_cleanup_prd.yaml')
tracker = yaml('research.yaml')
audit = yaml('contract_audit.yaml')
decisions = yaml('decisions.yaml')
evals = json('repo_artifact_cleanup_eval_cases.json')
probe = json('git_probe_evidence.json')

requirements = ids(prd.fetch('requirements').values.flatten)
criteria = ids(prd.fetch('acceptance_criteria'))
stories = ids(prd.fetch('user_stories'))
evidence = ids(audit.fetch('evidence_sources'))
research = tracker.fetch('items') + tracker.fetch('deferred_measurements', [])
research_ids = ids(research)
ids(decisions.fetch('decisions'))
ids(prd.fetch('implementation_sequence'))
ids(evals.fetch('cases'))

assert(prd.dig('metadata', 'canonical') == true, 'PRD must be canonical')
references(audit.dig('acceptance_criteria', 'ids'), criteria, 'audit criteria')
assert(ids(audit.fetch('findings'), 'criterion_id') == criteria, 'Audit must cover every criterion')
audit.fetch('findings').each { |finding| references(finding.fetch('evidence'), evidence, 'audit finding') }
audit.fetch('recommendation_review').each do |review|
  references(review.fetch('evidence'), evidence, review.fetch('id'))
  references(review.fetch('requirements'), requirements, review.fetch('id'))
end

research.each do |item|
  %w[id title state priority complexity depends_on next_action evidence decision].each do |key|
    assert(item.key?(key), "Missing research field #{key}: #{item['id']}")
  end
  references(item.fetch('evidence'), evidence, item.fetch('id'))
  references(item.fetch('depends_on'), research_ids, item.fetch('id'))
  assert(!item.fetch('depends_on').include?(item.fetch('id')), 'Research cannot depend on itself')
  if item.fetch('state') == 'complete'
    assert(!item.fetch('decision').empty?, "Complete research lacks decision: #{item['id']}")
    assert(!item.fetch('evidence').empty?, "Complete research lacks evidence: #{item['id']}")
    item.fetch('depends_on').each do |dependency|
      assert(research.find { |r| r['id'] == dependency }['state'] == 'complete', "Unresolved dependency: #{item['id']} -> #{dependency}")
    end
  end
end

visiting = Set.new
visited = Set.new
visit = lambda do |id|
  return if visited.include?(id)
  assert(!visiting.include?(id), "Research dependency cycle: #{id}")
  visiting.add(id)
  research.find { |r| r['id'] == id }.fetch('depends_on').each { |dep| visit.call(dep) }
  visiting.delete(id)
  visited.add(id)
end
research_ids.each { |id| visit.call(id) }

decisions.fetch('decisions').each do |decision|
  references(decision.fetch('based_on_evidence'), evidence, decision.fetch('id'))
  references(decision.fetch('implements'), requirements, decision.fetch('id'))
end

covered_requirements = Set.new
covered_criteria = Set.new
covered_stories = Set.new
evals.fetch('cases').each do |test_case|
  %w[prompt_or_scenario expected_behavior assertions].each { |key| assert(!test_case.fetch(key).empty?, "Empty eval #{key}") }
  [['requirement_ids', requirements, covered_requirements], ['criterion_ids', criteria, covered_criteria], ['story_ids', stories, covered_stories]].each do |key, known, covered|
    references(test_case.fetch(key), known, test_case.fetch('id'))
    covered.merge(test_case.fetch(key))
  end
end
assert(covered_requirements == requirements, "Requirements lack evals: #{(requirements - covered_requirements).to_a}")
assert(covered_criteria == criteria, "Criteria lack evals: #{(criteria - covered_criteria).to_a}")
assert(covered_stories == stories, "Stories lack evals: #{(stories - covered_stories).to_a}")
slice_criteria = prd.fetch('implementation_sequence').flat_map { |slice| slice.fetch('acceptance') }.to_set
assert(slice_criteria == criteria, 'Implementation slices must cover the criteria')

readiness = tracker.dig('readiness', 'status')
assert(prd.dig('readiness', 'status') == readiness, 'PRD/tracker readiness disagree')
assert(audit.dig('implementation_readiness', 'status') == readiness, 'Audit/tracker readiness disagree')
if readiness == 'ready'
  assert(tracker.dig('readiness', 'blocking_ids').empty?, 'Ready tracker has blockers')
  assert(research.none? { |item| %w[P0 P1].include?(item['priority']) && item['state'] != 'complete' }, 'Ready tracker has incomplete critical research')
end
assert(probe.fetch('worktree_git_is_file') && probe.fetch('worktree_index_contains_tracked_file'), 'Worktree evidence is incomplete')

puts "Planning validation passed: #{requirements.size} requirements, #{criteria.size} criteria, #{evals['cases'].size} cases; readiness=#{readiness}."
puts 'This does not execute product tests or imply implementation approval.'
