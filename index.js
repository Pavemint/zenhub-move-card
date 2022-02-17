const { default: axios } = require('axios');
const core = require('@actions/core');
const { inspect } = require('util');

async function moveCardToPipeline(
  repoId,
  workspaceId,
  issueId,
  targetPipelineId
) {
  const url = `https://api.zenhub.com/p2/workspaces/${workspaceId}/repositories/${repoId}/issues/${issueId}/moves`;
  const response = await axios.post(url, {
    pipeline_id: targetPipelineId,
    position: 'top',
  });
  console.log(`POST ${url} -- [${response.status}]`);
}

async function getIdOfPipelineByName(repoId, workspaceId, pipelineName) {
  const url = `https://api.zenhub.com/p2/workspaces/${workspaceId}/repositories/${repoId}/board`;
  const response = await axios.get(url);
  console.log(`GET ${url} -- [${response.status}]`);
  const pipelines = response.data.pipelines;
  const pipeline = pipelines.find(
    (pipeline) => pipeline.name.indexOf(pipelineName) !== -1
  );
  if (pipeline) {
    return pipeline.id;
  } else {
    core.setFailed('No pipeline name of ' + pipelineName + ' found');
    return;
  }
}

async function getPipelineId(inputs) {
  let pipelineId;
  if (!inputs.pipelineId && inputs.pipelineName) {
    pipelineId = await getIdOfPipelineByName(
      inputs.zhRepoId,
      inputs.zhWorkspaceId,
      inputs.pipelineName
    );
  } else {
    pipelineId = inputs.pipelineId;
  }
  return pipelineId;
}

async function getIssuesFromPR(inputs) {
  const API_URL = 'https://api.github.com/graphql';
  const query = `query getIssueNumbers($url: URI!){
    resource(url: $url) {
      ... on PullRequest {
        closingIssuesReferences(first: 10) {
          nodes {
            number
            repository {
              id
            }
          }
        }
      }
    }
  }`;

  try {
    try {
      const result = await axios.post(
        API_URL,
        {
          query,
          variables: {
            url: inputs.prUrl,
          },
        },
        {
          headers: {
            Authorization: 'Bearer ' + inputs.githubToken,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (e) {
      core.setFailed(`Eerriri iwht query ${e.message}`);
    }
    core.info(`resilt success: ${result}`);
    core.info(`schema?: ${result.data._schema}`);
    core.info(`boop: ${result.data.resource}`);
    const data = result.data;

    const issueNodes =
      data && resource && closingIssuesReferences && nodes
        ? data.resource.closingIssuesReferences.nodes
        : [];
    core.info(`data-${issueNodes}`);
    core.info(Array.isArray(issueNodes));
    return issueNodes;
  } catch (e) {
    core.setFailed(`Failed to get linked issues: ${e.message}`);
    return;
  }
}

(async function () {
  try {
    const inputs = {
      zhToken: core.getInput('zh-token'),
      zhWorkspaceId: core.getInput('zh-workspace-id'),
      prUrl: core.getInput('pr-url'),
      pipelineId: core.getInput('zh-target-pipeline-id'),
      pipelineName: core.getInput('zh-target-pipeline-name'),
      githubToken: core.getInput('github-token'),
    };
    core.debug(`Inputs: ${inspect(inputs)}`);
    if (!inputs.pipelineId && !inputs.pipelineName) {
      core.setFailed(
        'one of zh-target-pipeline-id and zh-target-pipeline-name is required'
      );
      return;
    }
    const issues = await getIssuesFromPR(inputs);
    core.info(`Ises- ${Array.isArray(issues) && issues.length && issues[0]}`);
    core.info(`Issues- ${issues}`);
    axios.defaults.headers.common['X-Authentication-Token'] = inputs.zhToken;
    const pipelineId = await getPipelineId(inputs);

    issues.forEach(async (issue) => {
      await moveCardToPipeline(
        issue.repository.id,
        inputs.zhWorkspaceId,
        issue.number,
        pipelineId
      );
      core.info(`move issue ${issue.number} in ${issue.repo} to ${pipelineId}`);
    });
  } catch (err) {
    core.debug(inspect(err));
    core.setFailed(err.message);
  }
})();
