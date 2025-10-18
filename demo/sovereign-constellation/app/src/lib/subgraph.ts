import { GraphQLClient, gql } from "graphql-request";

export const makeClient = (url: string) => new GraphQLClient(url);

export const qJobs = gql`
  {
    jobs(first: 50, orderBy: id, orderDirection: desc) {
      id
      employer
      reward
      uri
      status
      validators {
        account
      }
    }
  }
`;
